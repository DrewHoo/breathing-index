import { describe, expect, it } from 'vitest'
import { PRIORS } from '../engine/config'
import { buildModel, predict } from '../engine/infer'
import type { DiaryEntry } from '../engine/types'
import { evidence } from './evidence'

const fresh = buildModel([])

const ESTIMATE_ASIDE =
  'That pollen figure is a calendar estimate for your region, not a measurement.'

describe('the Why line on an estimated variable', () => {
  it('says so on the day the estimate itself is the suspect', () => {
    // The shape the calendar actually produces: one bad day whose only
    // candidate was a season nobody measured.
    const diary: DiaryEntry[] = [
      {
        id: 'e1',
        time: '2026-08-20T15:00:00.000Z',
        rating: 3,
        exposure: { pm25: 3, o3: 10, ragweed_pollen: 10 },
        estimated: ['ragweed_pollen'],
      },
    ]
    const model = buildModel(diary)
    const today = { pm25: 3, o3: 10, ragweed_pollen: 10 }
    const prediction = predict(model, today, PRIORS)
    const { main, aside } = evidence(prediction, model, diary, ['ragweed_pollen'])
    expect(main).toContain('ragweed')
    expect(aside).toBe(ESTIMATE_ASIDE)
  })

  it('admits the pollen number was a calendar figure', () => {
    const prediction = predict(fresh, { ragweed_pollen: 50 }, PRIORS)
    const { main, aside } = evidence(prediction, fresh, [], ['ragweed_pollen'])
    expect(main).toContain('Ragweed')
    expect(aside).toBe(ESTIMATE_ASIDE)
  })

  it('says nothing of the sort where the species was measured', () => {
    const prediction = predict(fresh, { ragweed_pollen: 50 }, PRIORS)
    expect(evidence(prediction, fresh, []).aside).toBeUndefined()
  })
})
