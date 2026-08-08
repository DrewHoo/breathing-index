import {
  LEVELS,
  LEVELS_DESC,
  type AmbiguousConstraint,
  type Bounds,
  type Confirmation,
  type Conflict,
  type EvidenceGrade,
  type Exposure,
  type InertBounds,
  type InferenceEntry,
  type Level,
  type Prediction,
  type Priors,
  type Rating,
  type Reason,
  type TriggerModel,
  type VariableStatus,
} from './types'
import {
  INDOOR_PROXY_VARIABLES,
  SOURCE_SCOPED_VARIABLES,
  UNSPECIFIED_SOURCE,
  negligibleFor,
  noiseMarginFor,
} from './config'

const NO_EXCLUSIONS: ReadonlySet<string> = new Set()

/**
 * How many independent days a claim needs before the engine will stand on it.
 * One observation is a hint; two is a pattern. Applies in both directions: to
 * a trigger bound before it may set the floor, to a tolerance before it may
 * retire a population prior, and to a contradiction before it may re-open one.
 */
const REPETITIONS = 2

/** Variables an entry's observations rule out as candidates. */
function excludedCandidates(entry: InferenceEntry): ReadonlySet<string> {
  return entry.observations?.includes('worse-outdoors') ? INDOOR_PROXY_VARIABLES : NO_EXCLUSIONS
}

/**
 * Variables whose exposure on this entry was estimated rather than read — a
 * calendar-region pollen figure, today. They are ordinary candidates (a season
 * is a real suspect), but a claim resting on one is capped at
 * `suspected-strong` no matter how often it repeats: repetition is what turns
 * observations into proof, and repeating a guess only repeats the guess.
 *
 * Tolerance is deliberately left alone: a low-rated day still exonerates the
 * estimate, which is what lets a quiet ragweed season fade out of the forecast
 * instead of alarming every August day forever.
 */
function estimatedIn(entry: InferenceEntry): ReadonlySet<string> {
  return entry.estimated?.length ? new Set(entry.estimated) : NO_EXCLUSIONS
}

/**
 * The exposure a tolerance bound actually exonerates. A day logged at x could
 * have been x·(1−ε) in truth, so that is all it proves — the rest of the way
 * up to x is inside the model's error.
 */
const exonerates = (variable: string, tolerance: number): number =>
  tolerance * (1 - noiseMarginFor(variable))

/** An exposure has to clear this to be a suspect at all: background, plus half a margin. */
function candidateGuard(variable: string, level: Level, tolerance: Bounds): number {
  const tol = tolerance[variable]?.[level]
  const proven = tol === undefined ? 0 : exonerates(variable, tol)
  return Math.max(proven, negligibleFor(variable)) * (1 + noiseMarginFor(variable) / 2)
}

/** Measurably present — the same half-margin, without any tolerance evidence. */
const aboveNegligible = (variable: string, x: number): boolean =>
  x > negligibleFor(variable) * (1 + noiseMarginFor(variable) / 2)

function setBound(
  bounds: Bounds,
  variable: string,
  level: Level,
  value: number,
  keep: 'min' | 'max',
): void {
  const forVar = (bounds[variable] ??= {})
  const cur = forVar[level]
  if (cur === undefined || (keep === 'max' ? value > cur : value < cur)) {
    forVar[level] = value
  }
}

/** One usable diary entry, with its exposure already scoped to the active source. */
interface Usable {
  entry: InferenceEntry
  index: number
  /** true when a source switch stripped variables from this entry's exposure */
  amputated: boolean
}

interface Tolerance {
  bounds: Bounds
  /** which entry set each bound — the other half of a conflict pair */
  setBy: Record<string, Partial<Record<Level, number>>>
}

function toleranceFrom(entries: Usable[]): Tolerance {
  const bounds: Bounds = {}
  const setBy: Record<string, Partial<Record<Level, number>>> = {}
  for (const { entry, index } of entries) {
    for (const level of LEVELS) {
      if (entry.rating >= level) continue
      for (const [variable, x] of Object.entries(entry.exposure)) {
        const cur = bounds[variable]?.[level]
        if (cur === undefined || x > cur) {
          setBound(bounds, variable, level, x, 'max')
          ;(setBy[variable] ??= {})[level] = index
        }
      }
    }
  }
  return { bounds, setBy }
}

/**
 * A tolerance bound is `confirmed` once a second low-rated entry lands within
 * the noise margin of it, and `provisional` until then. The distinction is not
 * academic: the exposure vector is *outdoor* air, and a fine day spent indoors
 * with the AC on looks identical to a fine day spent breathing that air. One
 * such day narrows the personal candidate sets; it does not get to overrule
 * what published breakpoints say about a level nobody has really tested.
 */
function gradeTolerance(
  entries: Usable[],
  bounds: Bounds,
): Record<string, Partial<Record<Level, EvidenceGrade>>> {
  const grades: Record<string, Partial<Record<Level, EvidenceGrade>>> = {}
  for (const [variable, byLevel] of Object.entries(bounds)) {
    for (const level of LEVELS) {
      const bound = byLevel[level]
      if (bound === undefined) continue
      const near = entries.filter(
        ({ entry }) =>
          entry.rating < level &&
          entry.exposure[variable] !== undefined &&
          entry.exposure[variable]! >= exonerates(variable, bound),
      ).length
      ;(grades[variable] ??= {})[level] = near >= REPETITIONS ? 'confirmed' : 'provisional'
    }
  }
  return grades
}

function candidatesFor(
  exposure: Exposure,
  level: Level,
  tolerance: Bounds,
  excluded: ReadonlySet<string> = NO_EXCLUSIONS,
): string[] {
  return Object.entries(exposure)
    .filter(
      ([variable, x]) =>
        !excluded.has(variable) && x > candidateGuard(variable, level, tolerance),
    )
    .map(([variable]) => variable)
}

/** One bad day where a single variable survived as the candidate. */
interface SingletonHit {
  variable: string
  level: Level
  bound: number
  /** the rest of the day's elevated air, which the claim was observed against */
  context: Exposure
  /** nothing else was even measurably present */
  clean: boolean
  /** the candidate's own exposure was estimated, so this can never confirm */
  estimated: boolean
  entryIndex: number
}

/** A bad day whose candidate set a tolerance bound emptied. */
interface Blocked {
  entryIndex: number
  exposure: number
}

interface Extraction {
  hits: SingletonHit[]
  constraints: AmbiguousConstraint[]
  conflicts: Conflict[]
  /** "variable\u0000level" -> the bad days that bound silenced */
  blocked: Map<string, Blocked[]>
}

const boundKey = (variable: string, level: Level): string => `${variable}\u0000${level}`
const unKey = (key: string): [string, Level] => {
  const [variable, level] = key.split('\u0000')
  return [variable!, Number(level) as Level]
}

function extract(usable: Usable[], tolerance: Tolerance): Extraction {
  const hits: SingletonHit[] = []
  const constraints: AmbiguousConstraint[] = []
  const conflicts: Conflict[] = []
  const blocked = new Map<string, Blocked[]>()

  for (const { entry, index, amputated } of usable) {
    if (entry.rating < 2) continue
    let conflict: Conflict | null = null
    const excluded = excludedCandidates(entry)
    const estimated = estimatedIn(entry)
    for (const level of LEVELS) {
      if (level > entry.rating) break
      const candidates = candidatesFor(entry.exposure, level, tolerance.bounds, excluded)

      if (candidates.length === 0) {
        // Which tolerance bounds did the silencing? Those are the claims a
        // repeat of this day is entitled to re-open.
        let against: number | undefined
        for (const [variable, x] of Object.entries(entry.exposure)) {
          if (excluded.has(variable) || !aboveNegligible(variable, x)) continue
          if (tolerance.bounds[variable]?.[level] === undefined) continue
          const key = boundKey(variable, level)
          blocked.set(key, [...(blocked.get(key) ?? []), { entryIndex: index, exposure: x }])
          against ??= tolerance.setBy[variable]?.[level]
        }
        // An entry whose variables were stripped by a source switch is not a
        // contradiction; the engine simply took its evidence away.
        if (!conflict && !amputated) {
          // Would tolerance evidence available *before* this entry have explained it?
          const earlier = toleranceFrom(usable.filter((u) => u.index < index))
          const priorCandidates = candidatesFor(entry.exposure, level, earlier.bounds, excluded)
          conflict = {
            entryIndex: index,
            kind: priorCandidates.length > 0 ? 'superseded' : 'unmodeled-trigger',
            ...(against !== undefined ? { againstIndex: against } : {}),
          }
        }
        continue
      }

      if (candidates.length === 1) {
        const variable = candidates[0]!
        const context: Exposure = {}
        let clean = true
        for (const [other, x] of Object.entries(entry.exposure)) {
          if (other === variable || excluded.has(other) || !aboveNegligible(other, x)) continue
          context[other] = x
          clean = false
        }
        hits.push({
          variable,
          level,
          bound: entry.exposure[variable]!,
          context,
          clean,
          estimated: estimated.has(variable),
          entryIndex: index,
        })
      } else {
        constraints.push({
          entryIndex: index,
          level,
          candidates,
          exposure: entry.exposure,
          ...(candidates.some((v) => estimated.has(v)) ? { estimated: true } : {}),
        })
      }
    }
    if (conflict) conflicts.push(conflict)
  }

  return { hits, constraints, conflicts, blocked }
}

/**
 * Repeated contradictions re-open a tolerance. A newer fine day has always
 * superseded an older bad one; this is the other direction — when two bad days
 * land under the same tolerated exposure, the tolerance is what moved, not the
 * truth of the days. Drop it just under the lower of the two and re-run.
 */
function sensitivityShifts(
  blocked: Map<string, Blocked[]>,
): { variable: string; level: Level; value: number; entries: number[] }[] {
  const shifts = []
  for (const [key, days] of blocked) {
    const entries = [...new Set(days.map((d) => d.entryIndex))]
    if (entries.length < REPETITIONS) continue
    const [variable, level] = unKey(key)
    const lowest = Math.min(...days.map((d) => d.exposure))
    shifts.push({ variable, level, value: lowest * (1 - noiseMarginFor(variable)), entries })
  }
  return shifts
}

function confirmationsFrom(hits: SingletonHit[], source: string): Confirmation[] {
  const groups = new Map<string, SingletonHit[]>()
  for (const hit of hits) {
    const key = boundKey(hit.variable, hit.level)
    groups.set(key, [...(groups.get(key) ?? []), hit])
  }
  const confirmations: Confirmation[] = []
  for (const group of groups.values()) {
    // Days on measured air are the ones that count toward the repetition rule.
    // A calendar-estimated day is real evidence of *something* and can stand as
    // a suspicion of its own, but it cannot promote a measured suspicion to a
    // proof: two days only outrank one when both were observed.
    const measured = group.filter((h) => !h.estimated)
    const estimated = group.filter((h) => h.estimated)
    const days = new Set(measured.map((h) => h.entryIndex)).size
    const lowest = (hits: SingletonHit[]): SingletonHit =>
      hits.reduce((a, b) => (b.bound < a.bound ? b : a))
    const { variable, level } = group[0]!
    const record = (hits: SingletonHit[], strength: Confirmation['strength']): void => {
      const from = lowest(hits)
      confirmations.push({
        variable,
        level,
        bound: from.bound,
        // Bound and context always come from the same day: pairing the lowest
        // bound with somebody else's background would describe a combination
        // nobody ever observed.
        context: from.context,
        entryIndices: [...new Set(hits.map((h) => h.entryIndex))],
        strength,
        source,
      })
    }
    // The two kinds of claim are kept apart rather than merged. A clean day's
    // "this much, alone, full stop" would otherwise be swallowed by a lower
    // bound that only holds against a background.
    const clean = measured.filter((h) => h.clean)
    const withCompany = measured.filter((h) => !h.clean)
    if (clean.length > 0) record(clean, 'confirmed')
    if (withCompany.length > 0) {
      record(withCompany, days >= REPETITIONS ? 'confirmed' : 'suspected-strong')
    }
    // A day whose lone candidate was never measured stops here — even a clean
    // one, even a repeated one. It suspects; it does not prove.
    if (estimated.length > 0) record(estimated, 'suspected-strong')
  }
  return confirmations
}

const withoutSourceScoped = (exposure: Exposure): Exposure =>
  Object.fromEntries(Object.entries(exposure).filter(([v]) => !SOURCE_SCOPED_VARIABLES.has(v)))

/**
 * Pure function of the diary: recomputed from scratch, order-independent.
 * See docs/trigger-model.md.
 */
export function buildModel(
  diary: InferenceEntry[],
  options: { source?: string; includeInert?: boolean } = {},
): TriggerModel {
  const unscoped = diary
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.confounders?.length)

  // The active source is the last one actually recorded. Entries from before
  // the app recorded a source are not evidence of a switch — they came from
  // whatever was in use then — so they always count.
  const recorded = unscoped
    .map(({ entry }) => entry.source)
    .filter((s): s is string => s !== undefined)
  const source = options.source ?? recorded[recorded.length - 1] ?? UNSPECIFIED_SOURCE

  // A source switch starts a fresh bound set for the variables that source
  // measures. Everything else about the older entries still counts.
  const usable: Usable[] = unscoped.map(({ entry, index }) => {
    if (entry.source === undefined || entry.source === source) {
      return { entry, index, amputated: false }
    }
    const exposure = withoutSourceScoped(entry.exposure)
    const amputated = Object.keys(exposure).length !== Object.keys(entry.exposure).length
    return { entry: { ...entry, exposure }, index, amputated }
  })

  const tolerance = toleranceFrom(usable)
  const first = extract(usable, tolerance)

  const shifts = sensitivityShifts(first.blocked)
  const shiftConflicts: Conflict[] = []
  let final = first
  if (shifts.length > 0) {
    const byVariable = new Map<string, { entry: number; against?: number }>()
    for (const shift of shifts) {
      setBound(tolerance.bounds, shift.variable, shift.level, shift.value, 'min')
      const seen = byVariable.get(shift.variable)
      const entry = Math.max(...shift.entries)
      if (!seen || entry > seen.entry) {
        byVariable.set(shift.variable, {
          entry,
          against: tolerance.setBy[shift.variable]?.[shift.level],
        })
      }
    }
    for (const { entry, against } of byVariable.values()) {
      shiftConflicts.push({
        entryIndex: entry,
        kind: 'sensitivity-shift',
        ...(against !== undefined ? { againstIndex: against } : {}),
      })
    }
    // Tolerance only ever moves down here, so candidate sets only grow: one
    // re-run settles it, no iteration to a fixed point required.
    final = extract(usable, tolerance)
  }

  const confirmations = confirmationsFrom(final.hits, source)
  const confirmed: Bounds = {}
  for (const c of confirmations) {
    if (c.strength === 'confirmed') setBound(confirmed, c.variable, c.level, c.bound, 'min')
  }

  const conflicts = [...final.conflicts, ...shiftConflicts].sort(
    (a, b) => a.entryIndex - b.entryIndex,
  )

  return {
    tolerance: tolerance.bounds,
    toleranceGrade: gradeTolerance(usable, tolerance.bounds),
    confirmed,
    confirmations,
    constraints: final.constraints,
    conflicts,
    source,
    inert: options.includeInert === false ? [] : inertBounds(diary, source),
  }
}

/** Bound sets from sources the diary has moved off: kept, never predicted from. */
function inertBounds(diary: InferenceEntry[], active: string): InertBounds[] {
  const sources = [...new Set(diary.map((entry) => entry.source))].filter(
    (s): s is string => s !== undefined && s !== active,
  )
  return sources.map((source) => {
    const model = buildModel(
      diary.filter((entry) => entry.source === source),
      { source, includeInert: false },
    )
    return { source, tolerance: model.tolerance, confirmed: model.confirmed }
  })
}

const value = (exposure: Exposure, variable: string): number => exposure[variable] ?? 0

/** How much of the day's company a confirmation depends on is present now. */
function dominatesContext(exposure: Exposure, context: Exposure): boolean {
  return Object.entries(context).every(
    ([variable, x]) => value(exposure, variable) >= exonerates(variable, x),
  )
}

const gradeOf = (days: number): EvidenceGrade =>
  days >= REPETITIONS ? 'confirmed' : 'provisional'

/**
 * Predict [floor, ceiling] on the 1–4 Breathing Index for a forecast exposure.
 * Floor: evidence guarantees it. Ceiling: evidence or priors make it possible.
 *
 * Matching against personal evidence stays exact — `y_p ≥ x_p`, no margin. The
 * noise margin belongs where two observations are weighed against each other;
 * here the gap below an observed exposure is untested rather than mismeasured,
 * and the priors are what cover it.
 */
export function predict(model: TriggerModel, exposure: Exposure, priors: Priors = {}): Prediction {
  const reasons: Reason[] = []

  let floor: Rating = 1
  for (const level of LEVELS_DESC) {
    const confirmedHit = model.confirmations.find(
      (c) =>
        c.level === level &&
        c.strength === 'confirmed' &&
        value(exposure, c.variable) >= c.bound &&
        dominatesContext(exposure, c.context),
    )
    if (confirmedHit) {
      floor = level
      reasons.push({
        bound: 'floor',
        level,
        kind: 'confirmed',
        grade: gradeOf(confirmedHit.entryIndices.length),
        variables: [confirmedHit.variable],
        entryIndex: confirmedHit.entryIndices[confirmedHit.entryIndices.length - 1],
      })
      break
    }
    // Estimated constraints are excluded here and only here: repeating a
    // combination that was partly a guess is not proof of anything, so it
    // raises the ceiling below without ever guaranteeing the floor.
    const comboHit = model.constraints.find(
      (c) =>
        c.level === level &&
        !c.estimated &&
        c.candidates.every((v) => value(exposure, v) >= c.exposure[v]!),
    )
    if (comboHit) {
      floor = level
      reasons.push({
        bound: 'floor',
        level,
        kind: 'combo-repeat',
        grade: 'provisional',
        variables: comboHit.candidates,
        entryIndex: comboHit.entryIndex,
      })
      break
    }
  }

  let ceiling: Rating = floor
  for (const level of LEVELS_DESC) {
    if (level <= floor) break
    // A confirmation the current background does not reach still counts here:
    // "this much smoke alone was enough, on a day with ozone about" is honest
    // ceiling evidence on a clean day, just not a promise.
    const matched = model.confirmations.filter(
      (c) => c.level === level && value(exposure, c.variable) >= c.bound,
    )
    const suspects = [
      ...new Set([
        ...matched.map((c) => c.variable),
        ...model.constraints
          .filter((c) => c.level === level)
          .flatMap((c) => c.candidates.filter((v) => value(exposure, v) >= c.exposure[v]!)),
      ]),
    ]
    const priorHits = Object.entries(priors)
      .filter(([variable, byLevel]) => {
        const bound = byLevel[level]
        if (bound === undefined || value(exposure, variable) < bound) return false
        // Personal tolerance overrides priors — once it has been repeated. A
        // single fine day is not enough to retire a population claim.
        const tolerated = model.tolerance[variable]?.[level]
        if (tolerated === undefined) return true
        if (model.toleranceGrade[variable]?.[level] !== 'confirmed') return true
        return value(exposure, variable) > tolerated
      })
      .map(([variable]) => variable)
    if (suspects.length > 0 || priorHits.length > 0) {
      ceiling = level
      if (suspects.length > 0) {
        const days = Math.max(
          0,
          ...matched.map((c) => c.entryIndices.length),
          ...model.constraints.filter((c) => c.level === level).map(() => 1),
        )
        reasons.push({
          bound: 'ceiling',
          level,
          kind: 'suspect',
          grade: gradeOf(days),
          variables: suspects,
        })
      }
      if (priorHits.length > 0) {
        reasons.push({
          bound: 'ceiling',
          level,
          kind: 'prior',
          grade: 'prior',
          variables: priorHits,
        })
      }
      break
    }
  }

  return { floor, ceiling, reasons }
}

/** Evidence status of one variable at its current exposure, for the constituent strip. */
export function variableStatus(
  model: TriggerModel,
  priors: Priors,
  variable: string,
  current: number,
): VariableStatus {
  const confirmedAt = model.confirmed[variable]
  if (confirmedAt && LEVELS.some((l) => confirmedAt[l] !== undefined && current >= confirmedAt[l]!)) {
    return 'confirmed'
  }
  const suspected =
    model.constraints.some(
      (c) => c.candidates.includes(variable) && current >= c.exposure[variable]!,
    ) ||
    model.confirmations.some((c) => c.variable === variable && current >= c.bound)
  if (suspected) return 'suspected'
  const tol = model.tolerance[variable]?.[2]
  if (tol !== undefined && current <= tol) return 'tolerated'
  const prior2 = priors[variable]?.[2]
  if (prior2 !== undefined && current >= prior2) return 'prior-elevated'
  return 'unknown'
}
