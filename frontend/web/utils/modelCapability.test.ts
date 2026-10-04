import { describe, expect, it } from 'vitest'
import type { UserModelListItem } from '~/types/business-api'
import { buildDurationSelectOptions, parseModelCapability, resolveImageGenParamsFromAgentDefaults } from './modelCapability'

const imageModel = {
  modelCode: 'image-model',
  capability: {
    sizeOptions: ['1k', '2k'],
    aspectRatioOptions: ['16:9', '1:1'],
    defaultSize: '2k',
    defaultAspectRatio: '16:9'
  }
} as UserModelListItem

describe('resolveImageGenParamsFromAgentDefaults', () => {
  it('keeps GET agent defaults even when they differ from model defaults/options', () => {
    expect(
      resolveImageGenParamsFromAgentDefaults(
        { resolution: '1024x1024', aspectRatio: '1:1' },
        imageModel
      )
    ).toEqual({ resolution: '1024x1024', aspectRatio: '1:1' })
  })

  it('falls back per missing field without replacing the other agent default', () => {
    expect(
      resolveImageGenParamsFromAgentDefaults(
        { resolution: '', aspectRatio: '1:1' },
        imageModel
      )
    ).toEqual({ resolution: '2k', aspectRatio: '1:1' })
  })
})

describe('parseModelCapability long video options', () => {
  it('extends Agnes and H3 durations to 24 seconds for automatic splitting', () => {
    for (const modelCode of ['agnes-video-2.5-flash', 'minimax-h3-t2v']) {
      const snapshot = parseModelCapability({
        modelCode,
        capability: { durationOptions: [5, 8, 12] }
      } as UserModelListItem)
      expect(snapshot.durationOptions.at(-1)).toBe(24)
      expect(snapshot.durationOptions).toContain(13)
      expect(buildDurationSelectOptions(snapshot).at(-1)?.label).toContain('自动分段合并')
    }
  })

  it('does not extend unrelated video models', () => {
    const snapshot = parseModelCapability({
      modelCode: 'other-video',
      capability: { durationOptions: [5, 8, 12] }
    } as UserModelListItem)
    expect(snapshot.durationOptions).toEqual([5, 8, 12])
  })
})
