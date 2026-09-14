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

  it('still renders in a Why line built from an old entry', () => {
    // The whole point of keeping the names: this sentence is generated from
    // whatever the diary holds, and a diary predating spec 23 holds these.
    const diary: DiaryEntry[] = [
      {
        id: 'e1',
        time: '2026-01-14T09:00:00.000Z',
        rating: 3,
        exposure: { pm25: 4, o3: 5, cold_dry_stress: 8 },
      },
    ]
    const model = buildModel(diary)
    const prediction = predict(model, { pm25: 4, o3: 5, cold_dry_stress: 9 }, PRIORS)
    expect(evidence(prediction, model, diary).main).toContain('Cold, dry')
  })
})
