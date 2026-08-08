import { describe, expect, it } from 'vitest'
import fixtures from '../../tests/fixtures/trigger-cases.json'
import { buildModel, predict } from './infer'
import type {
  Bounds,
  EvidenceGrade,
  Exposure,
  InferenceEntry,
  Level,
  Priors,
  Rating,
  TriggerModel,
} from './types'

type BoundTable = Record<string, Record<string, number>>

interface FixtureCase {
  name: string
  /** why an expectation changed, when the new semantics made the old one wrong */
  why?: string
  priors?: BoundTable
  diary: {
    rating: number
    exposure: Exposure
    confounders?: string[]
    observations?: string[]
    source?: string
  }[]
  expectCandidates?: Record<string, string[][]>
  /** exact: every confirmed bound the engine learns must appear here */
  expectConfirmed?: BoundTable
  /** exact: every suspected-strong (one co-exposure day) bound must appear here */
  expectSuspectedStrong?: BoundTable
  /** subset: the tolerance bounds worth pinning for this case */
  expectTolerance?: BoundTable
  expectConflicts?: { kind: string; entry: number; against?: number }[]
  expectInertSources?: string[]
  predict?: {
    exposure: Exposure
    expect: number[]
    expectSource?: string
    expectGrade?: EvidenceGrade
  }[]
}

const toPriors = (raw: BoundTable | undefined): Priors => {
  const priors: Priors = {}
  for (const [variable, byLevel] of Object.entries(raw ?? {})) {
    priors[variable] = Object.fromEntries(
      Object.entries(byLevel).map(([l, v]) => [Number(l) as Level, v]),
    )
  }
  return priors
}

/** Bounds as plain string-keyed tables, so a fixture can be compared whole. */
const asTable = (bounds: Bounds): BoundTable => {
  const table: BoundTable = {}
  for (const [variable, byLevel] of Object.entries(bounds)) {
    const levels = Object.entries(byLevel).filter(([, v]) => v !== undefined)
    if (levels.length) table[variable] = Object.fromEntries(levels) as Record<string, number>
  }
  return table
}

const suspectedStrong = (model: TriggerModel): BoundTable => {
  const bounds: Bounds = {}
  for (const c of model.confirmations) {
    if (c.strength !== 'suspected-strong') continue
    const forVar = (bounds[c.variable] ??= {})
    const cur = forVar[c.level]
    if (cur === undefined || c.bound < cur) forVar[c.level] = c.bound
  }
  return asTable(bounds)
}

for (const fixture of fixtures.cases as FixtureCase[]) {
  describe(fixture.name, () => {
    const diary: InferenceEntry[] = fixture.diary.map((d) => ({
      rating: d.rating as Rating,
      exposure: d.exposure,
      confounders: d.confounders,
      observations: d.observations,
      source: d.source,
    }))
    const model = buildModel(diary)
    const priors = toPriors(fixture.priors)

    if (fixture.expectConfirmed) {
      it('confirms exactly the expected thresholds', () => {
        expect(asTable(model.confirmed)).toEqual(fixture.expectConfirmed)
      })
    }

    if (fixture.expectSuspectedStrong) {
      it('suspects exactly the expected thresholds', () => {
        expect(suspectedStrong(model)).toEqual(fixture.expectSuspectedStrong)
      })
    } else if (fixture.expectConfirmed) {
      it('claims nothing beyond the confirmed thresholds', () => {
        expect(suspectedStrong(model)).toEqual({})
      })
    }

    if (fixture.expectTolerance) {
      it('holds the expected tolerance bounds', () => {
        const tolerance = asTable(model.tolerance)
        for (const [variable, byLevel] of Object.entries(fixture.expectTolerance!)) {
          for (const [level, bound] of Object.entries(byLevel)) {
            expect(tolerance[variable]?.[level], `tolerance ${variable}@${level}`).toBeCloseTo(
              bound,
              6,
            )
          }
        }
      })
    }

    if (fixture.expectCandidates) {
      it('records the expected candidate sets', () => {
        for (const [level, sets] of Object.entries(fixture.expectCandidates!)) {
          const atLevel = model.constraints
            .filter((c) => c.level === Number(level))
            .map((c) => [...c.candidates].sort())
          for (const expected of sets) {
            expect(atLevel, `candidate set at level ${level}`).toContainEqual([...expected].sort())
          }
        }
      })
    }

    if (fixture.expectConflicts) {
      it(`flags exactly ${fixture.expectConflicts.length} conflict(s), by kind and pair`, () => {
        expect(
          model.conflicts.map((c) => ({
            kind: c.kind,
            entry: c.entryIndex,
            ...(c.againstIndex !== undefined ? { against: c.againstIndex } : {}),
          })),
        ).toEqual(fixture.expectConflicts)
      })
    }

    if (fixture.expectInertSources) {
      it('retains the superseded source bounds, inert', () => {
        expect(model.inert.map((i) => i.source)).toEqual(fixture.expectInertSources)
      })
    }

    fixture.predict?.forEach((probe, i) => {
      it(`predicts ${JSON.stringify(probe.expect)} for probe #${i}`, () => {
        const prediction = predict(model, probe.exposure, priors)
        expect([prediction.floor, prediction.ceiling]).toEqual(probe.expect)
        if (probe.expectSource === 'prior') {
          expect(prediction.reasons.some((r) => r.kind === 'prior')).toBe(true)
        }
        if (probe.expectGrade) {
          expect(prediction.reasons.map((r) => r.grade)).toContain(probe.expectGrade)
        }
      })
    })
  })
}
