import type { Exposure } from '../engine/types'
// The fine-fraction fingerprint lives in `ui/` because the PM2.5 row's
// sub-label was its first caller; the gate here is the same question asked of
// the same two numbers, and duplicating the 0.85 would let the row and the
// variable drift apart.
import { smokeFingerprint } from '../ui/smoke'
import {
  coversExposureVector,
  fetchAirNow,
  inAirNowCoverage,
  type AirNowObservations,
  type AirNowVariable,
  type MonitorSeries,
} from './airnow'
import { type PollenDay, fetchPollen } from './googlePollen'
import { fetchSmoke, recallSmokeHours, rememberSmokeHour, type SmokeDensity } from './hmsSmoke'
import {
  fetchMold,
  genusExposure,
  recallMoldReadings,
  rememberMoldReading,
  type MoldReading,
} from './mold'
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
  /**
   * Window features for variables the app shows and the engine does not grade
   * — `pm10` alone today (specs/24-vector-diet.md). A display-only row still
   * owes the reader the same quantity a graded row shows, a trailing mean
   * rather than the top of the hour, or one column would be carrying two
   * different claims. Same null discipline as `exposure`: a window holding no
   * data is absent, never 0. Optional because series cached by earlier
   * versions are re-read from localStorage and predate the field.
   */
  display?: Record<string, number>
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
   * When the smoke plume behind the current hour's density stopped being
   * observed, ISO UTC. Satellite smoke detection needs daylight, so overnight
   * the newest HMS analysis is yesterday afternoon's — the row says "as of"
   * with this rather than letting an 8 am reading pass for an 11 pm one.
   */
  smokeAsOf?: string
  /**
   * Variable -> the monitor that produced it, when a monitor did. The air
   * table names the station on the row rather than in a caption somewhere
   * else, because "PM2.5 · New Haven monitor" is the whole difference between
   * a measurement and a model cell.
   */
  siteNames?: Partial<Record<string, string>>
  /**
   * Which station the mold numbers came from, and what day it counted them.
   *
   * The row needs all four. A count is a 24-hour integration at one building
   * 50–100 miles away, published once a weekday morning, so "5,116" on its own
   * is the kind of number this app exists not to print: the station's name and
   * the date it counted are what turn it into a claim a person can check.
   * `units` is on here rather than in the labels table because it is the
   * *station's* — St. Louis prints a number and never says per what
   * (specs/28-mold.md §2), and its count is comparable only with its own
   * history. `category` is the publisher's own band, for the one shape of
   * station that reports a total with no genus split.
   */
  mold?: {
    stationId: string
    name: string
    /** the reading's own local day, `YYYY-MM-DD` */
    date: string
    units: 'spores/m3' | 'count'
    category?: string
  }
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

/**
 * `nitrogen_dioxide` left with the variable (specs/24-vector-diet.md): nothing
 * reads the column any more, so asking for it would be a field nobody parses.
 * `sulphur_dioxide` and `carbon_monoxide` stay — they have never been in the
 * vector either, but they are fetched against the day spec 20 admits them by
 * region, and until then they sit in `raw` where the region rule can find
 * them.
 */
const AIR_VARS = 'pm2_5,pm10,ozone,sulphur_dioxide,carbon_monoxide,us_aqi,european_aqi'
/**
 * Dew point is what the two air-drying features are cut from
 * (specs/23-dew-point-air.md). The other four came back in spec 28, and they
 * are back for one variable rather than for rows of their own: Alternaria and
 * Cladosporium are dry-weather spores, and `dry_spore_index` counts how many
 * of the conditions that release them are met (see `drySporeIndex`). The rule
 * spec 23 set still holds — a column no row shows and no variable is graded on
 * is one nobody can check — and each of these four is now inside a graded
 * number.
 *
 * Wind comes back in m/s rather than Open-Meteo's default km/h: the threshold
 * is stated in m/s in the aerobiology, and converting at the call site is one
 * more place for a factor of 3.6 to hide.
 */
const WEATHER_VARS =
  'dew_point_2m,temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation'

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

/* --- mold: a station's count, and the weather that stands in for one --- */

/**
 * Station days in the mold window, and why the window counts *station* days
 * rather than calendar ones.
 *
 * Three, because Cladosporium's asthma lag runs 0–3 days and Alternaria's 0–2
 * (research/asthma-triggers-evidence.md) — the same cumulative shape as grass,
 * for the same reason: a Thursday after a huge Tuesday is not a quiet day for
 * the person breathing it.
 *
 * Station days, because every one of these stations counts on weekdays only.
 * A window of the last three *calendar* days would empty itself every Monday
 * and hand back nothing on the day after a long weekend, which is not what the
 * air did — it is what the microscope did. So the window is the three most
 * recent days the station actually reported on or before this one, and the
 * staleness rule below is what stops that from quietly reaching back a month.
 */
const MOLD_WINDOW_DAYS = 3

/**
 * How far out of date a reading may be before the variables it feeds are
 * marked as estimates rather than readings (specs/28-mold.md §6, under the
 * spec-18 provenance rule). Three days: past that, a weekday station has
 * missed a working day and the number is describing air that has been and
 * gone. Estimated variables can suspect and never confirm.
 */
const MOLD_STALE_DAYS = 3

/** The publishers' band words, on the 0–5 index scale the pollen rows speak.
 * Only reachable for a `category`-precision station, of which the directory
 * currently holds none — every station in v1 publishes a number
 * (specs/28-mold.md §3: never fake a number from a category). */
const CATEGORY_INDEX: Record<string, number> = {
  absent: 0,
  none: 0,
  'very low': 1,
  low: 2,
  moderate: 3,
  medium: 3,
  high: 4,
  'very high': 5,
}

/** Whole days between two `YYYY-MM-DD` keys, `later − earlier`. */
const daysBetween = (earlier: string, later: string): number =>
  Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000)

/** The exposure a `count` station's reading contributes, or the index a
 * `category` one does — with a flag for whether that was a number or a word. */
function moldValue(reading: MoldReading): { value: number; estimated: boolean } | null {
  if (reading.precision === 'category') {
    const index = CATEGORY_INDEX[(reading.category ?? '').trim().toLowerCase()]
    // A band with no published mapping is still a band: the index is this
    // app's reading of a word, so it is an estimate however confident the
    // publisher sounded.
    return index === undefined ? null : { value: index, estimated: true }
  }
  return reading.total === null ? null : { value: reading.total, estimated: false }
}

/**
 * The mold half of one hour: the trailing window's total and genus counts, and
 * whether the newest reading behind them is old enough to be a guess.
 *
 * Highest day wins, as with grass, because these are 24-hour integrations and
 * averaging them would report a week nobody breathed. A day whose reading has
 * a null total contributes nothing in either direction and is *not* staleness:
 * Canton out of season states a date and no number, which means "nothing
 * counted today", not "nobody has looked since Friday".
 *
 * Genus variables are only ever set from a station that published that exact
 * key on that exact day (`genusExposure` in mold.ts) — never from a combined
 * bucket, never carried forward from a day the station did not name it.
 */
export function moldWindow(
  byDate: Map<string, MoldReading>,
  date: string,
): { exposure: Record<string, number>; estimated: boolean; newest: MoldReading } | null {
  const dates = [...byDate.keys()].filter((d) => d <= date).sort().reverse()
  const newestDate = dates[0]
  if (newestDate === undefined) return null
  const newest = byDate.get(newestDate)!
  const exposure: Record<string, number> = {}
  let estimated = daysBetween(newestDate, date) > MOLD_STALE_DAYS
  for (const day of dates.slice(0, MOLD_WINDOW_DAYS)) {
    const reading = byDate.get(day)!
    const total = moldValue(reading)
    if (total !== null) {
      exposure.mold = Math.max(exposure.mold ?? total.value, total.value)
      if (total.estimated) estimated = true
    }
    for (const [variable, count] of Object.entries(genusExposure(reading))) {
      exposure[variable] = Math.max(exposure[variable] ?? count, count)
    }
  }
  return Object.keys(exposure).length === 0 ? null : { exposure, estimated, newest }
}

/**
 * The months the dry-weather spores are actually in the air, by hemisphere.
 *
 * Alternaria and Cladosporium peak in late summer and autumn. Outside that the
 * proxy is absent rather than zero: "the weather today would release spores if
 * there were any" is a claim about February nobody can check, and a 0 written
 * into a February vector would be read as a clean day by every tolerance bound
 * in the engine.
 */
const inDrySporeSeason = (lat: number, month: number): boolean =>
  lat >= 0 ? month >= 7 && month <= 10 : month >= 1 && month <= 4

/** Total over a trailing window, `null` when the window holds no hours at all
 * — the same discipline as `windowMean`, and the sum is over what the window
 * holds rather than over what it wanted. */
function windowSum(values: (number | null)[], i: number, span: number): number | null {
  let sum = 0
  let n = 0
  for (let j = Math.max(0, i - span + 1); j <= i; j++) {
    const v = values[j]
    if (v != null) {
      sum += v
      n++
    }
  }
  return n === 0 ? null : sum
}

/**
 * The five conditions that put dry-weather spores in the air, and the count of
 * how many are met (specs/28-mold.md §7). Always an estimate: it is a weather
 * pattern standing in for a microscope, and nothing about it is a measurement
 * of spores.
 *
 * The mechanism is two-stage, which is why one of these looks backwards past
 * the dry spell. *Production* needs a wet spell — the fungus has to grow on
 * something first, on leaf litter and crop debris — and *release* needs warm,
 * dry, moving air, because Alternaria and Cladosporium are dry-discharge
 * spores flung off a drying surface. Rain suppresses them outright while it
 * falls, washing the air and raising basidiospores and ascospores instead
 * (research/asthma-triggers-evidence.md, "rain means high mold" under the
 * myths). So: a wet week, then a dry warm windy day, is the shape of an
 * Alternaria peak, and either half alone is not.
 *
 * A count rather than a product: five factors multiplied would put a number
 * with four decimal places on a screen, and the honest resolution here is
 * "how many of the five conditions are met", 0–5.
 */
function drySporeIndex(
  temperature: number | null,
  humidity: number | null,
  wind: number | null,
  rain48h: number | null,
  rain7d: number | null,
): number | null {
  // A condition nobody can evaluate counts as unmet rather than dropping the
  // variable: an index of 2-of-5 with one column missing is a weaker claim in
  // the safe direction, and the only hour ever logged against is the current
  // one, which has all five. The earliest hours of the series are the ones
  // that can undercount, because the 7-day rain window reaches back past the
  // start of the weather feed.
  if (temperature === null && humidity === null && wind === null) return null
  let met = 0
  if (temperature !== null && temperature > 20) met++ // °C
  if (humidity !== null && humidity < 60) met++ // %RH
  if (wind !== null && wind > 2) met++ // m/s — enough to lift a dry spore off
  if (rain48h !== null && rain48h < 0.5) met++ // mm: nothing has washed the air
  if (rain7d !== null && rain7d >= 5) met++ // mm: something grew this week
  return met
}

/**
 * How far back the smoke gate may look for an hour with both PM readings on
 * it. Two hours, and the reason is AirNow's publishing order: the NowCast goes
 * out first and the raw hourly concentrations follow it, so the current hour
 * routinely has neither `pm25` nor `pm10` in `raw` while the hour before it
 * has both. Without the look-back, the smoke row would blink out for the top
 * of every hour and come back when the monitors caught up.
 */
const SMOKE_GATE_LOOKBACK_HOURS = 2

/**
 * Does the particulate at this hour look like smoke — yes, no, or unanswerable?
 *
 * HMS sees a column from above: a plume aloft over clean surface air is flagged
 * exactly as one at head height is. The fine-fraction fingerprint (ui/smoke.ts:
 * enough fine mass to mean anything, and almost all of the mass fine) is what
 * turns "smoke somewhere overhead" into "smoke in the air you are breathing"
 * without a surface smoke model (specs/25-smoke-variable.md).
 *
 * Null is the third answer and it matters: an hour with no raw PM on it, and
 * none in the two hours behind it, has not said the smoke is harmless — it has
 * said nothing, and the variable goes absent rather than recording a 0 the
 * engine would read as a tolerated clean hour.
 */
function fineFractionGate(
  pm25: (number | null)[],
  pm10: (number | null)[],
  i: number,
): boolean | null {
  for (let j = i; j >= 0 && j > i - 1 - SMOKE_GATE_LOOKBACK_HOURS; j--) {
    const fine = pm25[j]
    const coarse = pm10[j]
    if (fine == null || coarse == null) continue
    return smokeFingerprint({ pm25: fine, pm10: coarse })
  }
  return null
}

/** What the caller wants consulted beyond the model feeds. */
export interface ExposureOptions {
  /**
   * Ask AirNow's monitors too, and run the series off them when they cover the
   * vector. Off by default so a history backfill and a test both stay on the
   * model; the home screen passes the user's Settings toggle.
   */
  airnow?: boolean
  /**
   * The mold counting station to read, by relay station id, or null/absent for
   * none — the user's Settings choice, passed the same way the AirNow toggle
   * is. Absent by default so a history backfill and a test both stay on the
   * feeds that need no choosing. The dry-spore proxy does not depend on it:
   * it is computed in season either way, and it is the only mold signal a
   * place with no station within reach ever gets.
   */
  moldStation?: string | null
}

/**
 * Fetch air quality + weather and derive per-hour exposure vectors using the
 * per-variable windows from docs/trigger-model.md — one window per mechanism
 * (o3: mean8h; pm25: mean24h; dry air and humid heat: instantaneous; grass
 * pollen: the highest of the trailing three local days; other pollen: its
 * local day's index, daily being all any pollen source resolves). PM10 gets
 * the same 24-hour mean and lands in `display` rather than `exposure`: the
 * row shows it, the engine never grades it (specs/24-vector-diet.md). This
 * function is the only place windows live, and
 * changing one renames the source (EXPOSURE_SOURCE). `smoke` is the one
 * variable with no window at all: HMS is a nowcast, so the hour either has a
 * plume over it or does not, and the forecast hours have none either way
 * (specs/25-smoke-variable.md). `mold` and its two genus variables are the
 * highest of the trailing three *station* days, because a counting station
 * works weekdays and a calendar window would empty itself every Monday; the
 * `dry_spore_index` proxy is a per-hour count of five weather conditions and
 * is always estimated (specs/28-mold.md). Pollen rides a separate
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
  const common = `latitude=${lat}&longitude=${lon}&forecast_days=2&timezone=auto`
  // The two feeds no longer ask for the same past. Air stays at three days —
  // that is the series the screen draws and the longest window it grades, the
  // 24-hour PM mean. Weather goes back seven, for one condition of the
  // dry-spore proxy: "has there been a wet spell this week", which is the half
  // of the mechanism that produces the spores the other half releases. Nothing
  // is drawn from the extra four days; they exist to be summed.
  const airRange = `${common}&past_days=3`
  const weatherRange = `${common}&past_days=7&wind_speed_unit=ms`
  const wantsMonitors = options.airnow === true && inAirNowCoverage(lat, lon)
  // HMS's domain is North America, and `inAirNowCoverage` is the only
  // North-America-shaped box this app has — drawn for the monitors, already
  // tested, already the footprint the US-only half of the app lives in. Its
  // edges are not HMS's: Canada and Mexico are inside the analysis and outside
  // this box, and a Vancouver user gets no smoke variable because of it. That
  // is the deliberate trade — outside the box the variable is *absent*, which
  // is what a satellite that never looked at you actually says, where always
  // fetching would write a 0 into a Paris vector and call it "no smoke". A
  // second coverage box is the honest fix on the day someone north of the
  // border wants one.
  const wantsSmoke = inAirNowCoverage(lat, lon)
  const moldStation = options.moldStation ?? null
  const [airRes, weatherRes, pollenDays, monitors, smokeNow, moldNow] = await Promise.all([
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${airRange}&hourly=${AIR_VARS}`),
    fetch(`https://api.open-meteo.com/v1/forecast?${weatherRange}&hourly=${WEATHER_VARS}`),
    fetchPollen(lat, lon),
    // A station outage must not take the whole screen down: without monitors
    // this is the series it has always been.
    wantsMonitors
      ? fetchAirNow(lat, lon).catch((): AirNowObservations | null => null)
      : Promise.resolve(null),
    // `fetchSmoke` answers null rather than throwing, for the same reason.
    wantsSmoke ? fetchSmoke(lat, lon) : Promise.resolve(null),
    // And `fetchMold` for a third time: a health department that redecorated
    // its page overnight is a missing row, never an error screen.
    moldStation ? fetchMold(moldStation) : Promise.resolve(null),
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
  const so2 = series(air.hourly, 'sulphur_dioxide')
  const co = series(air.hourly, 'carbon_monoxide')
  const usAqi = series(air.hourly, 'us_aqi')
  const eaqi = series(air.hourly, 'european_aqi')
  const dew = series(weather.hourly, 'dew_point_2m')
  // The dry-spore proxy's four, on the weather grid rather than the air one:
  // the weather block reaches four days further back, so every index into
  // these is a weather index (`wi`), never the series index.
  const temperature = series(weather.hourly, 'temperature_2m')
  const humidity = series(weather.hourly, 'relative_humidity_2m')
  const wind = series(weather.hourly, 'wind_speed_10m')
  const precipitation = series(weather.hourly, 'precipitation')

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

  // Today's smoke is this evening's history, on exactly the pollen argument:
  // HMS publishes the latest analysis and nothing behind it, so the trailing
  // hours of the sparkline — and of the variable — exist only because earlier
  // fetches wrote them down (hmsSmoke.ts). The key is the UTC hour, because
  // the answer is about now and the series' own hour strings are local.
  const nowUtcHour = `${new Date().toISOString().slice(0, 13)}:00`
  if (smokeNow) rememberSmokeHour(lat, lon, nowUtcHour, smokeNow.density)
  const smokeHours = recallSmokeHours(lat, lon)

  // And a third store on the same argument (mold.ts). The relay serves one
  // station's *newest* reading and nothing behind it, because the pages
  // themselves publish one day and replace it — so the only way Friday's
  // window holds Wednesday's count is that the app was open on Wednesday. The
  // reading is filed under the station's own date, which is the day it
  // counted rather than the day anybody read it.
  if (moldNow) rememberMoldReading(moldNow)
  const moldDays = moldStation ? recallMoldReadings(moldStation) : new Map<string, MoldReading>()
  const moldByDate = new Map<string, ReturnType<typeof moldWindow>>()
  const moldFor = (date: string): ReturnType<typeof moldWindow> => {
    if (!moldByDate.has(date)) moldByDate.set(date, moldWindow(moldDays, date))
    return moldByDate.get(date) ?? null
  }

  const measured = monitors !== null && coversExposureVector(monitors) ? monitors : null
  // Everything the monitors do not measure leaves the series with them: one
  // source per series is what learned bounds are scoped to, and a CAMS number
  // smuggled into a station series would be a bound learned against the wrong
  // instrument. Under the null discipline the absence says "unknown", which is
  // the truth, rather than a zero that would read as clean.
  //
  // SO₂ and CO are all that is left here. They are fetched, they land in `raw`,
  // and they are deliberately *not* in the exposure vector: an evidence line
  // may only cite a number the user can check, and neither has a row in the
  // air table. specs/20-baseline-bad-air.md admits them where they actually
  // drive asthma — SO₂ near smelters and volcanic haze, CO in cookstove
  // regions — by region, and that region rule is the guard. Absent one, they
  // stay out of the US vector rather than arriving as two more dimensions
  // nobody in Connecticut has a bad day from.
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
    // The display half of the same discipline: a number the row prints and no
    // candidate set ever contains (specs/24-vector-diet.md).
    const display: Record<string, number> = {}
    const putDisplay = (variable: string, x: number | null): void => {
      if (x !== null) display[variable] = x
    }
    // One window per mechanism (specs/22-exposure-windows.md). PM's published
    // breakpoints are 24-hour means and the ED-visit epidemiology runs at lag
    // 0–2 days, so the day is the unit. Ozone's are 8-hour means, and AirNow's
    // ozone number is a NowCast of the same shape — a max of hourlies graded
    // against a mean prior over-warns by construction.
    put('pm25', windowMean(pm25, i, 24))
    put('o3', windowMean(o3, i, 8))
    // PM10 is computed on PM2.5's window and then kept out of the vector
    // (specs/24-vector-diet.md). Coarse PM has weak independent evidence for
    // acute asthma, and PM10 is *PM2.5 plus the coarse fraction* — so it
    // co-moves with PM2.5 by construction and inflated every candidate set
    // with a variable no clean day could ever separate from it. The row keeps
    // the number, because a person should be able to see how much coarse
    // particulate is outside; the engine keeps its identifiability. Where
    // coarse PM matters on its own — dust storms, RR 1.06 at lag 0–3 —
    // specs/20-baseline-bad-air.md adds `dust` as its own variable rather than
    // asking this one to mean two things.
    //
    // NO₂ left the vector in the same spec and left nothing behind: no row, no
    // column, no fetch. Controlled-exposure meta-analyses find it
    // statistically significant and clinically marginal, with no dose-response
    // between 100 and 600 ppb; where it earns its keep is as an amplifier
    // after allergen challenge, which is not a dimension this model has. And
    // NO₂ gradients are sub-kilometer, so a 45 km CAMS cell reads as noise
    // about the one thing it was standing in for — traffic, which
    // `near-traffic` now records as an observation instead.
    putDisplay('pm10', windowMean(pm10, i, 24))
    // Smoke: a satellite density, gated on what the PM columns say about the
    // air at ground level (specs/25-smoke-variable.md). No window — HMS is a
    // nowcast and the plume either is overhead this hour or is not — and no
    // seat for the forecast hours, which is why this is the one variable the
    // curve stops at now.
    //
    // Three states, and the third is the point. A density with a gate that
    // fires is the density; a density with a gate that refuses is 0, because
    // the satellite did look and the air below the plume is not fine-mode; a
    // density nobody has for this hour, or an hour whose PM cannot answer, is
    // *absent* — the vector never carries a smoke reading that no instrument
    // stands behind.
    //
    // Deliberately not source-scoped (engine/config.ts): the density is a
    // satellite product that reads the same whether the PM columns came from
    // CAMS or from a monitor, and the gate asks those columns a yes/no rather
    // than putting their numbers in the vector. A source switch changes what
    // "pm25 was 20" means; it does not change what "Medium plume overhead"
    // means.
    const utcHour = utcHourKey(time, air.utc_offset_seconds)
    const hmsDensity: SmokeDensity | undefined =
      i > currentIndex
        ? undefined
        : (smokeHours.get(utcHour) ?? (utcHour === nowUtcHour ? smokeNow?.density : undefined))
    if (hmsDensity !== undefined) {
      const gate = fineFractionGate(pm25, pm10, i)
      if (gate !== null) put('smoke', gate ? hmsDensity : 0)
    }
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
    // One estimated set per hour, shared by every variable that can be a
    // guess rather than a reading: calendar pollen, a stale or word-shaped mold
    // reading, and the dry-spore proxy, which is always one.
    const estimatedKeys = new Set(pollenEstimated ? Object.keys(pollenDay.exposure) : [])
    for (const [variable, value] of Object.entries(pollenDay.exposure)) put(variable, value)
    if (grass) {
      exposure[GRASS.variable] = grass.value
      pollenTypes.grass = {
        value: grass.value,
        plants: [{ variable: GRASS.variable, name: GRASS.name, value: grass.value }],
      }
      if (grass.estimated) estimatedKeys.add(GRASS.variable)
      else estimatedKeys.delete(GRASS.variable)
    }

    // Mold, from the station the user picked (specs/28-mold.md). A count is a
    // 24-hour integration over a day the station names, so the day is the
    // resolution and an hour is not a thing the number has: every hour of a
    // local date carries that date's window, exactly as pollen does.
    //
    // The forecast hours carry *today's* value rather than nothing. That is
    // not a forecast — nobody forecasts spore counts, and this app would not
    // print one if they did — it is the plainest available reading of "what is
    // in the air this afternoon" when the instrument answers once a morning.
    // They stay subject to the same staleness test, and nothing is ever logged
    // against them: an entry captures the current hour.
    const moldDate = i > currentIndex ? localToday : date
    const mold = moldFor(moldDate)
    if (mold) {
      for (const [variable, value] of Object.entries(mold.exposure)) {
        put(variable, value)
        // Stale, or read off a category word: either way the hour's mold
        // numbers are this app's estimate of the air rather than a count of
        // it, and an estimate may suspect and never confirm (spec 18's
        // provenance rule). A null total is *not* this case — the station
        // counted nothing and said so, which contributes nothing to the window
        // and makes no claim about how old the newest real count is.
        if (mold.estimated) estimatedKeys.add(variable)
      }
    }

    // The proxy, for every place and every hour with no station behind it —
    // which is nearly all of them (specs/28-mold.md §7). Computed whenever the
    // season is on, station or no station: it is a different claim from a
    // count, the engine can hold both, and where there is a station it fills
    // the days between the weekday readings.
    //
    // Past hours only, because the conditions are read off measured weather
    // and a forecast of them would be a guess about a guess. Out of season it
    // is absent rather than 0: a February vector carrying `dry_spore_index: 0`
    // would read to every tolerance bound in the engine as a day this person
    // handled fine, and the thing they handled fine was winter.
    const drySpore =
      i > currentIndex || !inDrySporeSeason(lat, monthOf(time))
        ? null
        : drySporeIndex(
            temperature[wi] ?? null,
            humidity[wi] ?? null,
            wind[wi] ?? null,
            windowSum(precipitation, wi, 48),
            windowSum(precipitation, wi, 24 * 7),
          )
    if (drySpore !== null) {
      put('dry_spore_index', drySpore)
      // Always. It is a weather pattern wearing a spore count's clothes, and
      // the provenance rule is the only thing keeping it from confirming a
      // bound no microscope ever stood behind.
      estimatedKeys.add('dry_spore_index')
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
    putRaw('so2', so2Column[i] ?? null)
    putRaw('co', coColumn[i] ?? null)
    putRaw('dry_air', dryAir)
    putRaw('humid_heat', humidHeat)
    // The density *before* the gate, which is what the smoke row's sparkline
    // draws: the shape a person can check against the sky is "was there a
    // plume", and a curve of the gated value would flatten every hour the PM
    // columns had not posted yet into something that looked like clear air.
    putRaw('hms_density', hmsDensity ?? null)
    // The dew-point row draws the reading itself, not either feature: the two
    // are one curve folded at 11 and 18, and a sparkline of a hinge would jump
    // to zero every time the air passed through comfortable.
    putRaw('dewpoint', d)
    // The newest count on or before this hour's day, not the window's max: the
    // sparkline is a record of what was read, and what was read is one number
    // a morning. It draws as a staircase — flat across each day, stepping when
    // the station posted — which is what a daily instrument honestly looks
    // like on an hourly axis.
    putRaw('mold', mold?.newest.total ?? null)
    putRaw('dry_spore_index', drySpore)
    return {
      time,
      ...(Object.keys(pollenTypes).length > 0 ? { pollenDisplay: pollenTypes } : {}),
      ...(estimatedKeys.size > 0 ? { estimated: [...estimatedKeys] } : {}),
      ...(measured && i > currentIndex ? { forecastSource: 'cams' as const } : {}),
      exposure,
      ...(Object.keys(display).length > 0 ? { display } : {}),
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
    ...(smokeNow?.end ? { smokeAsOf: smokeNow.end } : {}),
    // Who counted and when, for the row's note. Taken from the current hour's
    // own window rather than from the fetch, so a reading read back out of the
    // store when the relay is down still names itself — and so the date on the
    // row is the date behind the number beside it.
    ...(moldMeta(moldFor(localToday)) ?? {}),
  }
}

/** The series-level `mold` block, or nothing when no station answered. */
function moldMeta(
  window: ReturnType<typeof moldWindow>,
): Pick<ExposureSeries, 'mold'> | null {
  if (!window) return null
  const { stationId, name, date, units, category } = window.newest
  return {
    mold: {
      stationId,
      name,
      date,
      units,
      ...(category ? { category } : {}),
    },
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
