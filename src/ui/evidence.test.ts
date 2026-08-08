import { describe, expect, it } from 'vitest'
import { PRIORS } from '../engine/config'
import { buildModel, predict } from '../engine/infer'
import { evidence } from './evidence'

const fresh = buildModel([])

describe('the Why line on an estimated variable', () => {
  it('admits the pollen number was a calendar figure', () => {
    const prediction = predict(fresh, { ragweed_pollen: 50 }, PRIORS)
    const { main, aside } = evidence(prediction, fresh, [], ['ragweed_pollen'])
    expect(main).toContain('Ragweed')
    expect(aside).toBe(
      'That pollen figure is a calendar estimate for your region, not a measurement.',
    )
  })

  it('says nothing of the sort where the species was measured', () => {
    const prediction = predict(fresh, { ragweed_pollen: 50 }, PRIORS)
    expect(evidence(prediction, fresh, []).aside).toBeUndefined()
  })
})
