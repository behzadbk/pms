import { isBuildingTier } from '../platform/tiers'

describe('isBuildingTier', () => {
  it('سطوح شناخته‌شده را می‌پذیرد', () => {
    for (const t of ['simple', 'economic', 'professional']) expect(isBuildingTier(t)).toBe(true)
  })
  it('مقدار نامعتبر/خالی را رد می‌کند', () => {
    for (const t of ['admin', '', null, undefined, 5]) expect(isBuildingTier(t)).toBe(false)
  })
})
