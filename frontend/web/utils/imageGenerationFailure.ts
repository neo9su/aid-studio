export interface ImageGenerationFailureDetail {
  reason: string
  suggestion: string
  errorCode?: string
  retryable?: boolean
  taskId?: number
  displayMessage: string
}

interface ImageGenerationFailureOptions {
  fallbackReason?: string
  taskId?: number | null
}

const GENERIC_FAILURE_MESSAGES = new Set([
  '操作失败',
  '请求失败',
  '生成失败',
  '生图失败',
  '系统繁忙',
  '未知错误',
  'task sse error'
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return asRecord(value)
  const text = value.trim()
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null
  try {
    return asRecord(JSON.parse(text))
  } catch {
    return null
  }
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function findFailureField(
  value: unknown,
  fields: string[],
  depth = 0,
  seen = new Set<unknown>()
): unknown {
  if (depth > 4 || value == null || seen.has(value)) return undefined
  const record = parseJsonRecord(value)
  if (!record) return undefined
  seen.add(value)

  // Axios/业务信封中的具体错误通常位于这些嵌套对象，优先于外层 Request failed。
  for (const key of ['response', 'data', 'errorData', 'detail', 'cause']) {
    const nested = findFailureField(record[key], fields, depth + 1, seen)
    if (nested !== undefined && nested !== null && nested !== '') return nested
  }
  for (const field of fields) {
    const hit = record[field]
    if (hit !== undefined && hit !== null && hit !== '') return hit
  }
  return undefined
}

function resolveSuggestion(reason: string, errorCode: string, retryable?: boolean): string {
  const haystack = `${errorCode} ${reason}`.toLowerCase()

  if (/余额|充值|balance|credit/.test(haystack)) {
    return '检查账户余额或模型供应商额度，充值后重新生成。'
  }
  if (/参考图.*(超限|过多)|maxreference|reference.*limit|输入数量超限/.test(haystack)) {
    return '减少参考图数量；ComfyUI 当前最多支持 4 张参考图。'
  }
  if (/图片无效|参考图.*(地址|来源|读取|下载|缺失)|素材.*(读取|下载)|file_download|image.*invalid/.test(haystack)) {
    return '删除失效参考图，再从 AID 素材库重新导入；不要使用站外链接。'
  }
  if (/格式|format|文件类型/.test(haystack)) {
    return '改用 JPG、PNG 或 WebP 图片后重新导入。'
  }
  if (/尺寸|分辨率|resolution|像素|过大|too large/.test(haystack)) {
    return '降低图片分辨率或文件大小，并选择模型支持的画幅和清晰度。'
  }
  if (/审核|违规|敏感|content.*filter|policy|real_person/.test(haystack)) {
    return '调整提示词或更换参考图，避免敏感、违规或受限真人内容。'
  }
  if (/模型.*(不支持|不符|无效|不能)|能力|capabil|parameter_incompatible|业务未绑定/.test(haystack)) {
    return '在模型配置中确认已启用文生图/图生图能力，或切换到兼容模型。'
  }
  if (/comfyui|workflow|checkpoint|节点|node|工作流/.test(haystack)) {
    return '检查 ComfyUI 服务、工作流节点和写实模型是否可用，再重新生成。'
  }
  if (/显存|out of memory|cuda|gpu|oom/.test(haystack)) {
    return '降低分辨率和生成张数，确认 GPU 显存释放后再试。'
  }
  if (/超时|timeout|network|连接|拒绝访问|auth|不可用|server_error/.test(haystack)) {
    return '检查模型服务连通性和密钥配置；恢复后重新生成。'
  }
  if (/繁忙|busy|rate.limit|任务较多|排队/.test(haystack)) {
    return '模型服务当前繁忙，请稍后重新生成。'
  }
  if (/提示词为空|内容为空|input_empty/.test(haystack)) {
    return '补充清晰的画面描述后重新生成。'
  }
  if (/提示词.*(过长|太长)|input_too_long|context/.test(haystack)) {
    return '精简提示词，保留人物、场景、动作和画面风格等关键信息。'
  }
  if (retryable === true) {
    return '该错误可以重试；请稍后重新生成，并在任务中心查看任务详情。'
  }
  return '检查参考图、提示词和模型配置后重试；仍失败时请在任务中心查看任务详情。'
}

/** 把提交异常、SSE 错误和任务详情统一转换成“原因 + 可执行建议”。 */
export function formatImageGenerationFailure(
  error: unknown,
  options: ImageGenerationFailureOptions = {}
): ImageGenerationFailureDetail {
  const directString = nonEmptyString(error)
  const extractedMessage = nonEmptyString(
    findFailureField(error, ['userMessage', 'errorMessage', 'msg', 'message', 'reason'])
  )
  const rawReason = extractedMessage || directString || options.fallbackReason || '未返回具体失败原因'
  const generic = GENERIC_FAILURE_MESSAGES.has(rawReason.trim().toLowerCase())
  const reason = generic ? '服务端未返回具体失败原因' : rawReason
  const errorCode = nonEmptyString(findFailureField(error, ['errorCode', 'code'])) || undefined
  const retryableRaw = findFailureField(error, ['retryable'])
  const retryable = typeof retryableRaw === 'boolean' ? retryableRaw : undefined
  const nestedTaskId = Number(findFailureField(error, ['taskId']))
  const requestedTaskId = Number(options.taskId)
  const taskId = Number.isFinite(requestedTaskId) && requestedTaskId > 0
    ? requestedTaskId
    : Number.isFinite(nestedTaskId) && nestedTaskId > 0
      ? nestedTaskId
      : undefined
  const suggestion = resolveSuggestion(reason, errorCode || '', retryable)
  const codeText = errorCode && !/^\d+$/.test(errorCode) ? `（${errorCode}）` : ''
  const taskText = taskId ? ` 任务ID：${taskId}。` : ''

  return {
    reason,
    suggestion,
    errorCode,
    retryable,
    taskId,
    displayMessage: `生图失败：${reason}${codeText}。处理建议：${suggestion}${taskText}`
  }
}
