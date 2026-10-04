import { EDIT_ASSET_PROMPT_MAX_CHARS } from './htmlPlain'

function validateRequiredVideoPrompt(
  value: string
): { ok: true } | { ok: false; message: string } {
  const text = String(value ?? '')
  if (!text.trim()) {
    return { ok: false, message: '提示词不能为空' }
  }
  if (text.length > EDIT_ASSET_PROMPT_MAX_CHARS) {
    return { ok: false, message: '提示词过长' }
  }
  return { ok: true }
}

/** 多参方向提示词：前端仅校验非空与统一长度边界。 */
export function validateMultiParamVideoPromptPlain(
  plain: string
): { ok: true } | { ok: false; message: string } {
  return validateRequiredVideoPrompt(plain)
}

/**
 * 读取提示词时间轴的最晚结束秒数。
 * 支持常见的 `0-8s`、`8–16 秒`、`8至16秒` 写法；只用于提交前风险提示，
 * 不改写用户文本，也不阻止自由格式提示词提交。
 */
export function readVideoPromptTimelineEndSeconds(plain: string): number | null {
  const text = String(plain ?? '')
  const rangePattern = /(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:-|~|～|—|–|至|到)\s*(\d+(?:\.\d+)?)\s*(?:s|秒)/gi
  let maxEnd: number | null = null
  let match: RegExpExecArray | null
  while ((match = rangePattern.exec(text)) != null) {
    const end = Number(match[2])
    if (!Number.isFinite(end) || end <= 0) continue
    maxEnd = maxEnd == null ? end : Math.max(maxEnd, end)
  }
  return maxEnd
}

/** 当前生成时长短于提示词时间轴时，给出可执行的说明。 */
export function buildVideoPromptDurationWarning(
  plain: string,
  selectedDurationSeconds: number | string | null | undefined
): string {
  const selected = Number(selectedDurationSeconds)
  if (!Number.isFinite(selected) || selected <= 0) return ''
  const timelineEnd = readVideoPromptTimelineEndSeconds(plain)
  if (timelineEnd == null || timelineEnd <= selected) return ''
  return `提示词时间轴到 ${timelineEnd} 秒，但当前只生成 ${selected} 秒；${selected} 秒后的动作或台词可能不会执行，建议拆成两段或缩短时间轴。`
}

/** 图生方向提示词：格式规则由服务端统一校验。 */
export function validateImageToVideoPromptPlain(
  plain: string
): { ok: true } | { ok: false; message: string } {
  return validateRequiredVideoPrompt(plain)
}

/** 宫格方向提示词：格式规则由服务端统一校验。 */
export function validateGridVideoPromptPlain(
  plain: string
): { ok: true } | { ok: false; message: string } {
  return validateRequiredVideoPrompt(plain)
}

/** 首尾帧方向：提示词可空，非空时仅校验统一长度边界。 */
export function validateEdgeVideoPromptPlain(
  plain: string
): { ok: true } | { ok: false; message: string } {
  const text = String(plain ?? '')
  if (!text.trim()) return { ok: true }
  if (text.length > EDIT_ASSET_PROMPT_MAX_CHARS) {
    return { ok: false, message: '提示词过长' }
  }
  return { ok: true }
}

/** @deprecated 请使用 validateMultiParamVideoPromptPlain 或 validateImageToVideoPromptPlain */
export function validateStoryboardVideoPromptPlain(
  plain: string
): { ok: true } | { ok: false; message: string } {
  return validateImageToVideoPromptPlain(plain)
}
