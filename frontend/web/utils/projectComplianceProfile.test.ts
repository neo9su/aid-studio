import { describe, expect, it } from 'vitest'
import { normalizeProjectComplianceProfile } from '~/utils/projectComplianceProfile'

describe('normalizeProjectComplianceProfile', () => {
  it('keeps supported project profiles', () => {
    expect(normalizeProjectComplianceProfile('CN_MAINLAND')).toBe('CN_MAINLAND')
    expect(normalizeProjectComplianceProfile('US_PLATFORMS')).toBe('US_PLATFORMS')
  })

  it('uses the private legacy fallback for missing or unknown values', () => {
    expect(normalizeProjectComplianceProfile(null)).toBe('PRIVATE_ADULT')
    expect(normalizeProjectComplianceProfile('unknown')).toBe('PRIVATE_ADULT')
  })
})
