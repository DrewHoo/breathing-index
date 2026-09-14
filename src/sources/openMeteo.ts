import type { Exposure } from '../engine/types'
import {
  coversExposureVector,
  fetchAirNow,
  inAirNowCoverage,
  type AirNowObservations,
  type AirNowVariable,
  type MonitorSeries,
} from './airnow'
import { type PollenDay, fetchPollen } from './googlePollen'
import { calendarPollen, monthOf } from './pollenCalendar'
import { recallPollenDays, rememberPollenDays } from './pollenHistory'
import { POLLEN_PLANTS } from './pollenPlants'

/** The display order of the three pollen rows. */
export const POLLEN_TYPE_ORDER = ['tree', 'grass', 'weed'] as const

export interface Hour {
  time: string
  exposure: Exposure
  /** raw instantaneous values for display, keyed like exposure variables */
  raw: Record<string, number>
  /** official composite indices, for scoreboard receipts only */
  official: { usAqi: number | null; eaqi: number | null }
  /**
   * The three pollen rows' display: per type, Google's own type index as the
   * headline and the per-plant readings ("birch 4 · oak 2") as the sub-label
   * — every number the engine can cite, visible on the row. Optional because
   * series cached by earlier versions are re-read from localStorage and
   * predate the field.
   */
  pollenDisplay?: PollenDay['types']
  /**
   * Exposure keys whose values are estimates rather than readings — the
   * calendar pollen types, on hours the measured feed does not cover. Copied
   * onto diary entries, where it stops the engine confirming a bound from a
   * guess.
   */
  estimated?: string[]
  /**
   * Set on the hours of a measured series whose air is still a model forecast.
   * AirNow has no hourly forecast — it publishes a daily category and nothing
   * that would draw a curve — and the home screen's "walk before 10 am" needs
   * one, so the hours after now on an `airnow` series come from CAMS and say
   * so. Nothing is ever logged against them: a diary entry captures the
   * current hour, which on such a series is always measured. The seam this
   * marks is drawn in specs/27-one-ozone.md.
   */
  forecastSource?: 'cams'
}

export interface ExposureSeries {
  hours: Hour[]
  currentIndex: number
  /**
   * When this object was parsed — debug metadata only. It is not a freshness
   * signal: a service-worker cache hit is parsed now and carries hours-old air.
   * Everything the UI says about age comes from the hours themselves (see
   * ui/freshness.ts).
   */
  fetchedAt: string
  utcOffsetSeconds: number
  /** which source these numbers are: learned bounds are scoped to it */
  source: string
  /**
   * Variable -> the monitor that produced it, when a monitor did. The air
   * table names the station on the row rather than in a caption somewhere
   * else, because "PM2.5 · New Haven monitor" is the whole difference between
   * a measurement and a model cell.
   */
  siteNames?: Partial<Record<string, string>>
}

/**
 * Open-Meteo's air-quality endpoint serves the CAMS model, not monitors. The
 * name is on every entry logged against it, because a bound learned here does
 * not transfer to a station feed reading the same air differently.
 *
 * The `-w2` is the window generation, not a second feed. Bounds are learned
 * against *features*, so putting ozone on an 8-hour mean and PM on a 24-hour
 * one (specs/22-exposure-windows.md) makes every stored `cams` bound a claim
 * about a quantity that no longer exists — "PM2.5 was 22" used to mean the
 * worst hour of eight and now means the average of a day. The engine cannot
 * version a bound per variable and does not need to: a window change is a
 * source change, and it already knows what to do with one of those. The old
 * `cams` set lands in `model.inert` on its own, kept and never predicted from.
 */
export const EXPOSURE_SOURCE = 'cams-w2'

/**
 * The station source. It is a separate name from `cams` because that is what
 * scopes learned bounds: CAMS global carries a warm-season positive ozone bias
 * in the eastern US — 166 µg/m³ in Hamden on 2026-08-07 against a New Haven
 * monitor implying about 82 — so a threshold learned on one feed is not a
 * threshold on the other (docs/trigger-model.md).
 *
 * No `-w2` on this one, deliberately: the windows changed before a single
 * entry was ever logged against a station series — spec 21 has not shipped —
 * so there is no old airnow bound set for a rename to retire. Renaming it
 * anyway would cost nothing today and confuse the next reader tomorrow.
 */
export const AIRNOW_SOURCE = 'airnow'

const AIR_VARS =
  'pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,us_aqi,european_aqi'
/**
 * Dew point is the whole weather ask (specs/23-dew-point-air.md). Temperature
 * and relative humidity left with the features that were derived from them:
 * both mechanisms this app models are about the water in the air, and a column
 * no row shows and no variable is graded on is one nobody can check.
 */
const WEATHER_VARS = 'dew_point_2m'

interface HourlyBlock {
  time: string[]
  [key: string]: (number | null)[] | string[]
}

const series = (block: HourlyBlock, key: string): (number | null)[] =>
  (block[key] as (number | null)[] | undefined) ?? []

/**
 * API times ("2026-08-07T13:00") are local to the location, with the offset
 * carried separately; this is the instant such an hour begins.
 */
export function hourInstant(time: string, utcOffsetSeconds: number): number {
  return Date.parse(`${time.slice(0, 16)}:00Z`) - utcOffsetSeconds * 1000
}

/** API times are local to the location; find the hour containing "now". */
export function findCurrentIndex(times: string[], utcOffsetSeconds: number): number {
  const nowKey = `${new Date(Date.now() + utcOffsetSeconds * 1000).toISOString().slice(0, 14)}00`
  const index = times.findIndex((t) => t >= nowKey)
  return index === -1 ? times.length - 1 : index
}

/**
 * Window features return null, not 0, when the window holds no data. A gap in
 * the feed is not a clean reading: recorded as 0 it would drop the variable
 * below its background floor and quietly disqualify the real trigger from
 * candidacy. Absent, it simply proves nothing either way.
 *
 * A partly-filled window is averaged over what it holds rather than over what
 * it wanted: a monitor that missed three hours of the last eight still knows
 * what the other five were, and dividing those five by eight would report air
 * cleaner than anybody breathed.
 */
function windowMean(values: (number | null)[], i: number, span: number): number | null {
  let sum = 0
  let n = 0
  for (let j = Math.max(0, i - span + 1); j <= i; j++) {
    const v = values[j]
    if (v != null) {
      sum += v
      n++
    }
  }
  return n === 0 ? null : sum / n
}

/**
 * The UTC hour key ("2026-09-13T22:00") for one of Open-Meteo's local hour
 * strings — the join between the two feeds. Open-Meteo serves times local to
 * the location with the offset carried separately; AirNow serves UTC. Keeping
 * the series on Open-Meteo's local grid is deliberate: freshness, the current
 * hour and the by-hour curve all read local time strings, and they keep
 * working unchanged whichever source filled the numbers in.
 */
function utcHourKey(time: string, utcOffsetSeconds: number): string {
  return new Date(hourInstant(time, utcOffsetSeconds)).toISOString().slice(0, 16)
}

/**
 * One monitor's readings laid onto the series' hour grid, with the model
 * carrying the hours after now.
 *
 * Past hours the monitor did not report are left absent rather than filled:
 * AirNow publishes the NowCast before the raw hourly, so the current hour's
 * raw concentration is routinely missing, and a gap written as 0 would drop
 * the variable below its background floor and quietly disqualify the real
 * trigger from suspicion (docs/trigger-model.md). The 8-hour window spans the
 * gap on its own.
 *
 * Forecast hours come from CAMS, which means the window features for the first
 * few hours after now mix a measured past with a modelled future. That is the
 * honest reading of "what will the last eight hours have held by 3 pm", and no
 * bound is ever learned from it — only the current hour is ever logged.
 */
function monitorColumn(
  monitor: MonitorSeries | undefined,
  times: string[],
  utcOffsetSeconds: number,
  modelled: (number | null)[],
  currentIndex: number,
): (number | null)[] {
  if (!monitor) return times.map(() => null)
  return times.map((time, i) =>
    i > currentIndex
      ? (modelled[i] ?? null)
      : (monitor.byHour.get(utcHourKey(time, utcOffsetSeconds)) ?? null),
  )
}

/**
 * The pollen half of an hour: which types, at what index, named by which
 * plants, and whether the numbers were measured or a calendar's claim. See
 * specs/18-measured-pollen.md for why a day, not an hour, is the resolution.
 *
 * Three places to ask, in order of standing: today's fetch, what earlier
 * fetches wrote down (pollenHistory.ts — Google serves today forward, so a
 * past day is only ever there because the app was open then), and the season
 * calendar, whose answers are estimates and say so.
 */
export function pollenForHour(
  measured: Map<string, PollenDay> | null,
  lat: number,
  lon: number,
  time: string,
  remembered: Map<string, PollenDay> | null = null,
): { day: PollenDay; estimated: boolean } {
  const date = time.slice(0, 10)
  const read = measured?.get(date) ?? remembered?.get(date)
  if (read) return { day: read, estimated: false }
  return { day: calendarPollen(lat, lon, monthOf(time)), estimated: true }
}

/** Grass is the one pollen plant whose exposure is a window, not a day. */
const GRASS = POLLEN_PLANTS.GRAMINALES!

/** Days in that window, today included. */
const GRASS_WINDOW_DAYS = 3

/** The local date `back` days before this one, as a "2026-09-13" key. */
const shiftDate = (date: string, back: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10)

/**
 * Grass pollen over the trailing three local days, highest day wins.
 *
 * Grass is the only pollen taxon with a defensible asthma signal, and the
 * shape of that signal is cumulative rather than same-day: Erbas 2018's
 * meta-analysis puts the rise above a 3-day mean, and London's very-high-vs-low
 * IRR of 1.46 is at a 3-day lag. A day-of index systematically under-weights
 * the Thursday that follows a huge Tuesday. Max rather than mean because the
 * index is a 0–5 category, and averaging categories invents a resolution the
 * scale does not have.
 *
 * The window inherits the weakest provenance it touches: a max that includes a
 * calendar day is an estimate for that hour even when the winning day was
 * measured, because the claim "this was the worst of three days" leans on all
 * three. A day with no grass reading at all contributes nothing in either
 * direction — out of season is a blank, not a zero and not a guess.
 */
export function grassWindow(
  dayFor: (date: string) => { day: PollenDay; estimated: boolean },
  date: string,
): { value: number; estimated: boolean } | null {
  let value: number | null = null
  let estimated = false
  for (let back = 0; back < GRASS_WINDOW_DAYS; back++) {
    const { day, estimated: guessed } = dayFor(shiftDate(date, back))
    const reading = day.exposure[GRASS.variable]
    if (reading === undefined) continue
    if (value === null || reading > value) value = reading
    if (guessed) estimated = true
  }
  return value === null ? null : { value, estimated }
}

/** What the caller wants consulted beyond the model feeds. */
export interface ExposureOptions {
  /**
   * Ask AirNow's monitors too, and run the series off them when they cover the
   * vector. Off by default so a history backfill and a test both stay on the
   * model; the home screen passes the user's Settings toggle.
   */
  airnow?: boolean
}

/**
 * Fetch air quality + weather and derive per-hour exposure vectors using the
 * per-variable windows from docs/trigger-model.md — one window per mechanism
 * (o3: mean8h; pm25/pm10: mean24h; no2: the hour itself; dry air and humid
 * heat: instantaneous; grass pollen: the highest of the trailing three local
 * days; other pollen: its local day's index, daily being all any pollen
 * source resolves). This function is the only place windows live, and
 * changing one renames the source (EXPOSURE_SOURCE). Pollen rides a separate
 * pipe (googlePollen.ts via the relay, today forward) with what earlier
 * fetches wrote down (pollenHistory.ts) behind it and the season calendar
 * behind that — a fallback day is estimated-tagged, never silently
 * interchangeable with a measured one.
 *
 * Two feeds can fill the pollutant columns. CAMS model data is the default and
 * the worldwide one; it can miss hyper-local smoke, and over the US it is a
 * 45 km cell. When AirNow is on, the place is inside AirNow's coverage, and
 * the nearest monitors reported both pm2.5 and ozone in the trailing day, the
 * measured columns replace the modelled ones and the whole series is labelled
 * `airnow` — one source per series, because that is what learned bounds are
 * scoped to. Anything short of that and the series is `cams` exactly as
 * before. The window features are computed the same way either way: the
 * source decides what goes into the columns, never what is done with them.
 */
export async function fetchExposureSeries(
  lat: number,
  lon: number,
  options: ExposureOptions = {},
): Promise<ExposureSeries> {
  const common = `latitude=${lat}&longitude=${lon}&past_days=3&forecast_days=2&timezone=auto`
  const wantsMonitors = options.airnow === true && inAirNowCoverage(lat, lon)
  const [airRes, weatherRes, pollenDays, monitors] = await Promise.all([
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${common}&hourly=${AIR_VARS}`),
    fetch(`https://api.open-meteo.com/v1/forecast?${common}&hourly=${WEATHER_VARS}`),
    fetchPollen(lat, lon),
    // A station outage must not take the whole screen down: without monitors
    // this is the series it has always been.
    wantsMonitors
      ? fetchAirNow(lat, lon).catch((): AirNowObservations | null => null)
      : Promise.resolve(null),
  ])
  if (!airRes.ok || !weatherRes.ok) {
    throw new Error(`Open-Meteo fetch failed (${airRes.status}/${weatherRes.status})`)
  }
  const air = (await airRes.json()) as { hourly: HourlyBlock; utc_offset_seconds: number }
  const weather = (await weatherRes.json()) as { hourly: HourlyBlock }

  const times = air.hourly.time
  const weatherTimeIndex = new Map(weather.hourly.time.map((t, i) => [t, i]))
  const currentIndex = findCurrentIndex(times, air.utc_offset_seconds)

  const modelled = {
    pm25: series(air.hourly, 'pm2_5'),
    pm10: series(air.hourly, 'pm10'),
    o3: series(air.hourly, 'ozone'),
  }
  const no2 = series(air.hourly, 'nitrogen_dioxide')
  const so2 = series(air.hourly, 'sulphur_dioxide')
  const co = series(air.hourly, 'carbon_monoxide')
  const usAqi = series(air.hourly, 'us_aqi')
  const eaqi = series(air.hourly, 'european_aqi')
  const dew = series(weather.hourly, 'dew_point_2m')

  // Today's pollen is tomorrow's history: the only way the 3-day grass window
  // ever has a day −2 in it is that some earlier fetch filed one. Only days
  // up to *this place's* today are filed — the relay's endpoint is a forecast
  // lookup, and one of its projections remembered as a reading would later be
  // graded as one.
  const localToday = new Date(Date.now() + air.utc_offset_seconds * 1000)
    .toISOString()
    .slice(0, 10)
  if (pollenDays) rememberPollenDays(lat, lon, pollenDays, localToday)
  const rememberedPollen = recallPollenDays(lat, lon)
  const pollenByDate = new Map<string, { day: PollenDay; estimated: boolean }>()
  const pollenDayFor = (date: string): { day: PollenDay; estimated: boolean } => {
    let day = pollenByDate.get(date)
    if (!day) {
      day = pollenForHour(pollenDays, lat, lon, date, rememberedPollen)
      pollenByDate.set(date, day)
    }
    return day
  }

  const measured = monitors !== null && coversExposureVector(monitors) ? monitors : null
  // Everything the monitors do not measure leaves the series with them. NO₂ is
  // the one that matters: AirNow rarely reports it, and under the null
  // discipline an absent variable is unknown, not clean — a CAMS number
  // smuggled into a station series would be a bound learned against the wrong
  // instrument. SO₂ and CO are display-only leftovers and go for company.
  const modelOnly = (column: (number | null)[]): (number | null)[] =>
    measured ? times.map(() => null) : column
  const column = (variable: AirNowVariable): (number | null)[] =>
    measured
      ? monitorColumn(
          measured.monitors[variable],
          times,
          air.utc_offset_seconds,
          modelled[variable],
          currentIndex,
        )
      : modelled[variable]

  const pm25 = column('pm25')
  const pm10 = column('pm10')
  const o3 = column('o3')
  const no2Column = modelOnly(no2)
  const so2Column = modelOnly(so2)
  const coColumn = modelOnly(co)

  const hours: Hour[] = times.map((time, i) => {
    const wi = weatherTimeIndex.get(time) ?? i
    const d = dew[wi] ?? null
    // Two one-sided features off one number (specs/23-dew-point-air.md).
    //
    // `dry_air`: the mechanism behind what everyone calls cold-air asthma is
    // airway drying, and it is gated on the water content of inspired air
    // rather than on temperature — bronchoconstriction needs air below
    // 10 mg H₂O/L, which is a dew point of 11 °C / 52 °F. Evans et al. found
    // cold adds nothing over dry. The feature this replaces gated on T < 10 °C,
    // so a 20 °C April day with a 5 °C dew point read 0 while the air it
    // described was drier than most of January.
    //
    // `humid_heat`: a separate reflex, not the other end of the same one —
    // Hayes 2012 produced bronchoconstriction with hot humid hyperventilation
    // and blocked it completely with ipratropium, so it is cholinergic. A dew
    // point of 18 °C and up only occurs in hot air, so one number encodes hot
    // and humid together and the vector keeps a dimension.
    //
    // Both absent when the dew point is, never 0: a gap is not a mild day.
    const dryAir = d == null ? null : Math.max(0, 11 - d)
    const humidHeat = d == null ? null : Math.max(0, d - 18)
    // The engine may only reason about variables the app can show the user, so
    // so2 and co stay out of the exposure vector until the air table has rows
    // for them: an evidence line must never cite a number nobody can check.
    const exposure: Exposure = {}
    const put = (variable: string, x: number | null): void => {
      if (x !== null) exposure[variable] = x
    }
    // One window per mechanism (specs/22-exposure-windows.md). PM's published
    // breakpoints are 24-hour means and the ED-visit epidemiology runs at lag
    // 0–2 days, so the day is the unit. Ozone's are 8-hour means, and AirNow's
    // ozone number is a NowCast of the same shape — a max of hourlies graded
    // against a mean prior over-warns by construction. NO₂ acts within the
    // hour it is breathed, and a 45 km model cell has nothing longer to say
    // about a gas whose gradients are sub-kilometer.
    put('pm25', windowMean(pm25, i, 24))
    put('pm10', windowMean(pm10, i, 24))
    put('o3', windowMean(o3, i, 8))
    put('no2', no2Column[i] ?? null)
    // Both felt in the hour they are breathed, so no window. Relative
    // humidity used to ride along as a 72-hour mean stand-in for indoor mold
    // load; it pools at OR 1.05 on its own and pointed the wrong way as a
    // mold proxy — Alternaria and Cladosporium are dry-weather spores
    // (specs/28-mold.md) — so it leaves the vector rather than be re-aimed.
    put('dry_air', dryAir)
    put('humid_heat', humidHeat)
    // Pollen resolves by local day, not hour, so a day's index stands in for
    // every hour of it. Grass is the exception on the other axis: its exposure
    // is the highest of the trailing three days, because that is the shape of
    // the only pollen-and-asthma signal worth trusting (see grassWindow). It
    // replaces the day's own number on the display too — the row's number and
    // the number it is graded on have to be the same quantity, and a grass row
    // that vanished the day after a spike would hide the exposure the engine
    // is reasoning about. Plants, not types, enter the vector: only
    // plant-level numbers can ever answer "birch and not oak". The null
    // discipline holds: a plant the source omitted is absent, not zero.
    const date = time.slice(0, 10)
    const { day: pollenDay, estimated: pollenEstimated } = pollenDayFor(date)
    const grass = grassWindow(pollenDayFor, date)
    const pollenTypes: PollenDay['types'] = { ...pollenDay.types }
    const estimatedPollen = new Set(pollenEstimated ? Object.keys(pollenDay.exposure) : [])
    for (const [variable, value] of Object.entries(pollenDay.exposure)) put(variable, value)
    if (grass) {
      exposure[GRASS.variable] = grass.value
      pollenTypes.grass = {
        value: grass.value,
        plants: [{ variable: GRASS.variable, name: GRASS.name, value: grass.value }],
      }
      if (grass.estimated) estimatedPollen.add(GRASS.variable)
      else estimatedPollen.delete(GRASS.variable)
    }

    // The raw row follows the same rule as the vector: a variable this hour
    // has no reading for is missing from it, never zero. The air table skips
    // the row rather than printing a nought nobody measured. Raw is what was
    // read, so the windows do not reach it — grass here is this day's own
    // index, not the three-day max.
    const raw: Record<string, number> = { ...pollenDay.exposure }
    const putRaw = (variable: string, x: number | null): void => {
      if (x !== null) raw[variable] = x
    }
    putRaw('pm25', pm25[i] ?? null)
    putRaw('pm10', pm10[i] ?? null)
    putRaw('o3', o3[i] ?? null)
    putRaw('no2', no2Column[i] ?? null)
    putRaw('so2', so2Column[i] ?? null)
    putRaw('co', coColumn[i] ?? null)
    putRaw('dry_air', dryAir)
    putRaw('humid_heat', humidHeat)
    // The dew-point row draws the reading itself, not either feature: the two
    // are one curve folded at 11 and 18, and a sparkline of a hinge would jump
    // to zero every time the air passed through comfortable.
    putRaw('dewpoint', d)
    return {
      time,
      ...(Object.keys(pollenTypes).length > 0 ? { pollenDisplay: pollenTypes } : {}),
      ...(estimatedPollen.size > 0 ? { estimated: [...estimatedPollen] } : {}),
      ...(measured && i > currentIndex ? { forecastSource: 'cams' as const } : {}),
      exposure,
      raw,
      official: { usAqi: usAqi[i] ?? null, eaqi: eaqi[i] ?? null },
    }
  })

  return {
    hours,
    currentIndex,
    fetchedAt: new Date().toISOString(),
    utcOffsetSeconds: air.utc_offset_seconds,
    source: measured ? AIRNOW_SOURCE : EXPOSURE_SOURCE,
    ...(measured ? { siteNames: siteNamesOf(measured) } : {}),
  }
}

/** Which monitor each measured variable's numbers came from. */
function siteNamesOf(observations: AirNowObservations): Partial<Record<string, string>> {
  const names: Partial<Record<string, string>> = {}
  for (const [variable, monitor] of Object.entries(observations.monitors)) {
    if (monitor) names[variable] = monitor.siteName
  }
  return names
}
