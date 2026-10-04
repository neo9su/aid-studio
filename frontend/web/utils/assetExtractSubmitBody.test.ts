import { describe, expect, it } from 'vitest'
import { resolveAssetExtractScopeForTypes } from './assetExtractSubmitBody'

describe('resolveAssetExtractScopeForTypes', () => {
  it('keeps project-full scope for a character-only request', () => {
    expect(resolveAssetExtractScopeForTypes('PROJECT_FULL', ['character'])).toBe('PROJECT_FULL')
  })

  it('downgrades mixed or episode requests to incremental scope', () => {
    expect(resolveAssetExtractScopeForTypes('PROJECT_FULL', ['character', 'scene'])).toBe(
      'EPISODE_INCREMENTAL'
    )
    expect(resolveAssetExtractScopeForTypes('PROJECT_FULL', ['scene'])).toBe(
      'EPISODE_INCREMENTAL'
    )
    expect(resolveAssetExtractScopeForTypes(undefined, ['character'])).toBe(
      'EPISODE_INCREMENTAL'
    )
  })

  it('keeps project-outline scope for project-level asset initialization', () => {
    expect(resolveAssetExtractScopeForTypes('PROJECT_OUTLINE', ['character'])).toBe(
      'PROJECT_OUTLINE'
    )
    expect(resolveAssetExtractScopeForTypes('PROJECT_OUTLINE', ['scene', 'character', 'prop'])).toBe(
      'PROJECT_OUTLINE'
    )
  })
})
