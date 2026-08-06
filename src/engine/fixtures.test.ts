import { describe, expect, it } from 'vitest'
import fixtures from '../../tests/fixtures/trigger-cases.json'
import { buildModel, predict } from './infer'
import type { Exposure, InferenceEntry, Level, Priors, Rating } from './types'

interface FixtureCase {
  name: string
  priors?: Record<string, Record<string, number>>
  diary: { rating: number; exposure: Exposure; confounders?: string[]; observations?: string[] }[]
  expectCandidates?: Record<string, string[][]>
  expectConfirmed?: Record<string, Record<string, number>>
  expectConflicts?: number
  expectConflictKind?: string
  predict?: { exposure: Exposure; expect: number[]; expectSource?: string }[]
}

const toPriors = (raw: FixtureCase['priors']): Priors => {
  const priors: Priors = {}
  for (const [variable, byLevel] of Object.entries(raw ?? {})) {
    priors[variable] = Object.fromEntries(
      Object.entries(byLevel).map(([l, v]) => [Number(l) as Level, v]),
    )
  }
  return priors
}

for (const fixture of fixtures.cases as FixtureCase[]) {
  describe(fixture.name, () => {
    const diary: InferenceEntry[] = fixture.diary.map((d) => ({
      rating: d.rating as Rating,
      exposure: d.exposure,
      confounders: d.confounders,
      observations: d.observations,
    }))
    const model = buildModel(diary)
    const priors = toPriors(fixture.priors)

    if (fixture.expectConfirmed) {
      it('confirms the expected thresholds', () => {
        for (const [variable, byLevel] of Object.entries(fixture.expectConfirmed!)) {
          for (const [level, bound] of Object.entries(byLevel)) {
            expect(
              model.confirmed[variable]?.[Number(level) as Level],
              `confirmed ${variable}@${level}`,
            ).toBe(bound)
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
            expect(atLevel, `candidate set at level ${level}`).toContainEqual(
              [...expected].sort(),
            )
          }
        }
      })
    }

    if (fixture.expectConflicts !== undefined) {
      it(`flags ${fixture.expectConflicts} conflict(s)`, () => {
        expect(model.conflicts).toHaveLength(fixture.expectConflicts!)
      })
    }

    if (fixture.expectConflictKind) {
      it(`conflict kind is ${fixture.expectConflictKind}`, () => {
        expect(model.conflicts.map((c) => c.kind)).toEqual(
          model.conflicts.map(() => fixture.expectConflictKind),
        )
      })
    }

    fixture.predict?.forEach((probe, i) => {
      it(`predicts ${JSON.stringify(probe.expect)} for probe #${i}`, () => {
        const prediction = predict(model, probe.exposure, priors)
        expect([prediction.floor, prediction.ceiling]).toEqual(probe.expect)
        if (probe.expectSource === 'prior') {
          expect(prediction.reasons.some((r) => r.kind === 'prior')).toBe(true)
        }
      })
    })
  })
}
