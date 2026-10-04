import { describe, expect, it } from 'vitest'
import { EDIT_ASSET_PROMPT_MAX_CHARS } from './htmlPlain'
import {
  buildVideoPromptDurationWarning,
  readVideoPromptTimelineEndSeconds,
  validateEdgeVideoPromptPlain,
  validateGridVideoPromptPlain,
  validateImageToVideoPromptPlain,
  validateMultiParamVideoPromptPlain
} from './storyboardVideoPromptSave'

describe('storyboard video prompt validation', () => {
  const requiredValidators = [
    validateImageToVideoPromptPlain,
    validateGridVideoPromptPlain,
    validateMultiParamVideoPromptPlain
  ]

  it('leaves prompt format validation to the server', () => {
    const freeform = '  自由格式提示词\n保留换行和空格  '

    for (const validate of requiredValidators) {
      expect(validate(freeform)).toEqual({ ok: true })
    }
  })

  it('uses the shared 100,000-character boundary for every video mode', () => {
    const atLimit = '字'.repeat(EDIT_ASSET_PROMPT_MAX_CHARS)
    const overLimit = `${atLimit}字`

    for (const validate of [...requiredValidators, validateEdgeVideoPromptPlain]) {
      expect(validate(atLimit)).toEqual({ ok: true })
      expect(validate(overLimit)).toEqual({ ok: false, message: '提示词过长' })
    }
  })

  it('keeps required prompts non-empty while allowing an empty edge prompt', () => {
    for (const validate of requiredValidators) {
      expect(validate(' \n ')).toEqual({
        ok: false,
        message: '提示词不能为空'
      })
    }
    expect(validateEdgeVideoPromptPlain(' \n ')).toEqual({ ok: true })
  })

  it('reads the latest timestamp from common Chinese and English timeline ranges', () => {
    expect(readVideoPromptTimelineEndSeconds('0-8s 动作一；8–16 秒 动作二')).toBe(16)
    expect(readVideoPromptTimelineEndSeconds('0到5秒开场，5至12秒收尾')).toBe(12)
    expect(readVideoPromptTimelineEndSeconds('无时间轴的自由描述')).toBeNull()
  })

  it('warns without rewriting when the selected duration is shorter than the prompt timeline', () => {
    expect(buildVideoPromptDurationWarning('0-8s 开场；8-16s 收尾', 15)).toBe(
      '提示词时间轴到 16 秒，但当前只生成 15 秒；15 秒后的动作或台词可能不会执行，建议拆成两段或缩短时间轴。'
    )
    expect(buildVideoPromptDurationWarning('0-8s 完成', 8)).toBe('')
  })
})
