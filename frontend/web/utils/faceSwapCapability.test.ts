import { describe, expect, it } from 'vitest'
import { buildFaceSwapExecutionPrompt, supportsFaceSwap } from './faceSwapCapability'

describe('faceSwapCapability', () => {
  it('is enabled only by an explicit model capability', () => {
    expect(supportsFaceSwap({ capability: { supportsFaceSwap: true } } as any)).toBe(true)
    expect(supportsFaceSwap({ capability: { supportsFaceSwap: false } } as any)).toBe(false)
    expect(supportsFaceSwap(null)).toBe(false)
  })

  it('builds an isolated execution prompt without overwriting the editor original', () => {
    const original = '@图片2[旧角色] 原动作保持自然，参考@视频2[旧片段]'
    const result = buildFaceSwapExecutionPrompt(
      original,
      { assetId: '1', assetType: 'character', name: '新角色', imageIndex: 1, label: '@角色1' },
      { kind: 'video', name: '目标片段', referenceVideoRecordId: 9 }
    )

    expect(result).toContain('@图片1[新角色]')
    expect(result).toContain('@视频1[目标片段]')
    expect(result).toContain('原动作保持自然')
    expect(result).not.toContain('旧角色')
    expect(result).not.toContain('旧片段')
    expect(original).toContain('旧角色')
  })
})
