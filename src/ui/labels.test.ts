import { describe, expect, it } from 'vitest'
import { PRIORS } from '../engine/config'
import { buildModel, predict } from '../engine/infer'
import type { DiaryEntry } from '../engine/types'
import { evidence } from './evidence'
import { VARIABLE_LABELS, variableName } from './labels'

describe('the dew-point pair', () => {
  it('is named on every surface that names a variable', () => {
    expect(variableName('dry_air')).toBe('Dry air')
    expect(variableName('humid_heat')).toBe('Humid heat')
    expect(VARIABLE_LABELS.dry_air?.short).toBe('dry air')
    expect(VARIABLE_LABELS.humid_heat?.short).toBe('humid heat')
  })
})

describe('retired weather features (pre-spec-23)', () => {
  it('keeps a name for every variable an old entry can carry', () => {
    // The vector moved to dew point; the diary did not. An entry logged under
    // the old features still has to read as words rather than as a key.
    expect(variableName('cold_dry_stress')).toBe('Cold, dry')
    expect(variableName('heat_stress')).toBe('Heat')
    expect(variableName('humidity')).toBe('Humidity')
  })

  it('is never blamed in a Why line, even by an old entry that carried it', () => {
    // The names stay so old entries still read; the mechanism does not stay.
    // A retired feature is never a candidate (RETIRED_VARIABLES), so an old
    // bad day whose only elevated air was cold and dry is now a day the model
    // cannot explain, and the forecast says nothing about it rather than
    // blaming a variable the app no longer believes in.
    const diary: DiaryEntry[] = [
      {
        id: 'e1',
        time: '2026-01-14T09:00:00.000Z',
        rating: 3,
        exposure: { pm25: 4, o3: 5, cold_dry_stress: 8 },
      },
    ]
    const model = buildModel(diary)
    expect(model.conflicts).toEqual([{ entryIndex: 0, kind: 'unmodeled-trigger' }])
    const prediction = predict(model, { pm25: 4, o3: 5, cold_dry_stress: 9 }, PRIORS)
    expect(evidence(prediction, model, diary).main).not.toContain('Cold, dry')
  })
})
