import { isUserOrMediaTaskOngoing } from '~/composables/useTaskOngoing'
import {
fetchUserTaskDetailOnce,
normalizeTaskStatus,
resolveUserTaskTerminalOutcome,
TASK_SSE_TIMEOUT_MS,
waitUserTaskSseTerminal
} from '~/composables/useTaskSseFollow'
import type {
StoryboardVideoEdgeGenerateRequest,
StoryboardVideoGenerateData,
StoryboardVideoGenerateRequest,
StoryboardVideoGridGenerateRequest,
StoryboardVideoImageGenerateRequest
} from '~/types/business-api'
import { handleSseErrorRecharge,openRechargeModalFromInsufficientBalance } from '~/utils/api'
import {
userStoryboardGenerateVideo,
userStoryboardGenerateVideoEdge,
userStoryboardGenerateVideoGrid,
userStoryboardGenerateVideoImage,
userTaskDetailCached,
userTaskResume
} from '~/utils/businessApi'
import { parseTaskPartialFailedData } from '~/utils/taskPartialFailed'
import type { TaskSseProgressInput } from '~/utils/taskSseProgressText'

export { isUserOrMediaTaskOngoing as isStoryboardVideoTaskOngoing }

export type StoryboardVideoGenerateProgress = TaskSseProgressInput & {
  percent?: number
}

export type StoryboardVideoGenerateResult =
  | { ok: true; taskId: number; partial?: boolean; data?: unknown }
  | { ok: false; errorMessage: string; deferred?: boolean }

function terminalDataFromTaskDetail(resultData: unknown): unknown {
  if (resultData == null) return null
  if (typeof resultData === 'string') {
    const s = resultData.trim()
    if (!s) return null
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }
  return resultData
}

function okTerminalResult(
  taskId: number,
  options?: { partial?: boolean; data?: unknown }
): StoryboardVideoGenerateResult {
  const parsed = parseTaskPartialFailedData(options?.data) ?? options?.data ?? null
  return {
    ok: true,
    taskId,
    ...(options?.partial ? { partial: true } : {}),
    ...(parsed != null ? { data: parsed } : {})
  }
}

/** 兜底轮询节奏：前台 25s / 后台 60s，总上限 6 小时防无限轮询。 */
const TASK_TERMINAL_POLL_INTERVAL_MS = 25_000
const TASK_TERMINAL_POLL_HIDDEN_INTERVAL_MS = 60_000
const TASK_TERMINAL_POLL_MAX_MS = 6 * 60 * 60 * 1000

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * SSE 超时/断连但任务仍进行中时的周期兜底轮询：每 25s（后台 60s）查一次 task/detail，
 * 进行中则用 detail.eta 回填进度让进度条继续推进，直到任务进入终态再返回。
 * 根治「SSE 30 分钟硬超时后 UI 永久冻结在正在生成」的问题。
 */
export async function pollUntilTaskTerminal(
  taskId: number,
  onProgress?: (p: StoryboardVideoGenerateProgress) => void,
  options?: { intervalMs?: number; maxMs?: number }
): Promise<StoryboardVideoGenerateResult> {
  const deadline = Date.now() + (options?.maxMs ?? TASK_TERMINAL_POLL_MAX_MS)

  while (Date.now() < deadline) {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    const interval =
      options?.intervalMs ??
      (hidden
        ? TASK_TERMINAL_POLL_HIDDEN_INTERVAL_MS
        : TASK_TERMINAL_POLL_INTERVAL_MS)
    await sleepMs(interval)

    let resolved
    try {
      resolved = await resolveUserTaskTerminalOutcome(taskId, { force: true })
    } catch {
      // 单次 detail 拉取失败（网络抖动）不中断轮询，下一轮重试
      continue
    }

    if (resolved.kind === 'ongoing') {
      const detail = resolved.detail ?? null
      if (detail?.eta) {
        onProgress?.({
          taskId,
          status: detail.status,
          progress:
            typeof detail.eta.displayProgress === 'number'
              ? detail.eta.displayProgress
              : undefined,
          eta: detail.eta
        })
      }
      continue
    }

    const detail = resolved.detail ?? null
    if (resolved.kind === 'succeeded' || resolved.kind === 'partial_failed') {
      return okTerminalResult(taskId, {
        partial: resolved.kind === 'partial_failed',
        data: terminalDataFromTaskDetail(detail?.resultData)
      })
    }
    if (resolved.kind === 'cancelled') {
      return { ok: false, errorMessage: resolved.message || '任务已取消' }
    }
    if (resolved.kind === 'failed') {
      const msg = resolved.errorMessage || '视频生成失败'
      openRechargeModalFromInsufficientBalance(msg)
      return { ok: false, errorMessage: msg }
    }
  }

  // 超过上限仍未终态：回到原有 deferred 语义（刷新页面可恢复）
  return {
    ok: false,
    deferred: true,
    errorMessage: '任务仍在后台执行，请稍候或刷新页面自动恢复进度'
  }
}

export async function followStoryboardVideoGenerateTask(payload: {
  taskId: number
  onProgress?: (p: StoryboardVideoGenerateProgress) => void
}): Promise<StoryboardVideoGenerateResult> {
  const taskId = Number(payload.taskId)
  const { onProgress } = payload

  if (!Number.isFinite(taskId) || taskId <= 0) {
    return { ok: false, errorMessage: '任务ID无效' }
  }

  onProgress?.({ taskId, message: '分镜视频生成中…', stepTitle: '分镜视频生成中…' })

  try {
    const cachedDetail = await userTaskDetailCached(taskId)
    const initialProgress: TaskSseProgressInput | null = cachedDetail?.eta
      ? {
          taskId,
          status: cachedDetail.status,
          progress: cachedDetail.eta.displayProgress,
          eta: cachedDetail.eta
        }
      : null
    if (cachedDetail) {
      const st = normalizeTaskStatus(cachedDetail.status)
      if (st === 'SUCCEEDED' || st === 'PARTIAL_FAILED') {
        return okTerminalResult(taskId, {
          partial: st === 'PARTIAL_FAILED',
          data: terminalDataFromTaskDetail(cachedDetail.resultData)
        })
      }
      if (st === 'CANCELLED') {
        return { ok: false, errorMessage: '任务已取消' }
      }
      if (st === 'FAILED') {
        const msg = String(cachedDetail.errorMessage || '视频生成失败')
        openRechargeModalFromInsufficientBalance(msg)
        return { ok: false, errorMessage: msg }
      }
    }

    const terminal = await waitUserTaskSseTerminal({
      taskId,
      timeoutMs: TASK_SSE_TIMEOUT_MS,
      initialProgress,
      onProgress: (p) => {
        onProgress?.({
          ...p,
          taskId,
          percent: p.percent
        })
      }
    })

    if (terminal.kind === 'superseded') {
      // 刷新/重复 restore 会顶替旧 SSE：任务仍在后台，禁止当失败清 loading
      return {
        ok: false,
        deferred: true,
        errorMessage: 'Task SSE superseded'
      }
    }

    if (terminal.kind === 'timeout') {
      const detail = await fetchUserTaskDetailOnce(taskId)
      const resolved = await resolveUserTaskTerminalOutcome(taskId, { force: true })
      if (resolved.kind === 'succeeded' || resolved.kind === 'partial_failed') {
        return okTerminalResult(taskId, {
          partial: resolved.kind === 'partial_failed',
          data: terminalDataFromTaskDetail(detail?.resultData)
        })
      }
      if (resolved.kind === 'cancelled') {
        return { ok: false, errorMessage: resolved.message || '任务已取消' }
      }
      if (resolved.kind === 'failed') {
        const msg = resolved.errorMessage || '视频生成失败'
        openRechargeModalFromInsufficientBalance(msg)
        return { ok: false, errorMessage: msg }
      }
      const ongoing = await isUserOrMediaTaskOngoing(taskId)
      if (!ongoing) return okTerminalResult(taskId, { data: terminalDataFromTaskDetail(detail?.resultData) })
      // SSE 超时/断连但任务仍在后台执行：进入周期兜底轮询，避免 UI 永久冻结。
      return await pollUntilTaskTerminal(taskId, payload.onProgress)
    }

    const r = terminal.event
    if (r.type === 'complete' || r.type === 'partial_failed') {
      return okTerminalResult(taskId, {
        partial: r.type === 'partial_failed',
        data: r.data
      })
    }

    const detail = await fetchUserTaskDetailOnce(taskId)
    const st = normalizeTaskStatus(detail?.status)
    if (st === 'SUCCEEDED' || st === 'PARTIAL_FAILED') {
      return okTerminalResult(taskId, {
        partial: st === 'PARTIAL_FAILED',
        data: terminalDataFromTaskDetail(detail?.resultData)
      })
    }

    if (r.type === 'error') {
      const msg = r.errorMessage || String(detail?.errorMessage || '视频生成失败')
      handleSseErrorRecharge(r.errorData, msg)
      return { ok: false, errorMessage: msg }
    }

    if (r.type === 'cancelled') {
      return { ok: false, errorMessage: r.message || '任务已取消' }
    }

    if (st === 'FAILED') {
      const msg = String(detail?.errorMessage || '视频生成失败')
      openRechargeModalFromInsufficientBalance(msg)
      return { ok: false, errorMessage: msg }
    }

    return { ok: false, errorMessage: String(detail?.errorMessage || '分镜视频生成未完成') }
  } catch (e: unknown) {
    const msg = String((e as Error)?.message || '分镜视频生成任务异常')
    const name = String((e as { name?: string })?.name || '')
    // 刷新/重复 restore 中断 fetch 流：任务仍在后台，禁止当失败清状态
    if (name === 'AbortError' || /abort|信号被中断|The user aborted/i.test(msg)) {
      return {
        ok: false,
        deferred: true,
        errorMessage: '任务仍在后台执行，请稍候或刷新页面自动恢复进度'
      }
    }
    openRechargeModalFromInsufficientBalance(msg)
    return { ok: false, errorMessage: msg }
  }
}

async function submitAndFollowStoryboardVideoTask(payload: {
  submit: () => Promise<StoryboardVideoGenerateData>
  onProgress?: (p: StoryboardVideoGenerateProgress) => void
  onSubmitted?: (p: { taskId: number }) => void
  notifyGlobalTasks?: boolean
  progressMessage: string
  submitErrorMessage: string
}): Promise<StoryboardVideoGenerateResult> {
  const { submit, onProgress, onSubmitted, progressMessage, submitErrorMessage } = payload

  let submitted: StoryboardVideoGenerateData
  try {
    submitted = await submit()
  } catch (e: unknown) {
    const err = e as { msg?: string; message?: string }
    const msg = String(err?.msg || err?.message || submitErrorMessage)
    openRechargeModalFromInsufficientBalance(msg)
    return { ok: false, errorMessage: msg }
  }

  const items = submitted?.items ?? []
  const acceptedItems = items.filter((item) => item.accepted)
  const rejectedItems = items.filter((item) => !item.accepted)
  if (items.length > 0 && acceptedItems.length === 0) {
    const reason = rejectedItems.map((item) => item.reason).filter(Boolean).join('；') || '全部失败'
    return { ok: false, errorMessage: reason }
  }

  const taskId = Number(submitted?.taskId)
  if (!Number.isFinite(taskId) || taskId <= 0) {
    const reason = rejectedItems.map((item) => item.reason).filter(Boolean).join('；')
    return { ok: false, errorMessage: reason || '提交失败：未返回任务ID' }
  }

  onSubmitted?.({ taskId })

  if (payload.notifyGlobalTasks !== false && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('create-flow-global-tasks-updated'))
  }

  const submitStatus = String(submitted.status || '').toUpperCase()
  if (submitStatus === 'SUCCEEDED' || submitStatus === 'PARTIAL_FAILED') {
    return { ok: true, taskId }
  }
  if (submitStatus === 'FAILED') {
    return { ok: false, errorMessage: '视频生成失败' }
  }

  onProgress?.({
    taskId,
    message: progressMessage,
    stepTitle: progressMessage
  })

  return followStoryboardVideoGenerateTask({ taskId, onProgress })
}

/** 图生方向出片：POST /api/user/storyboard/generate/video/image */
export async function runStoryboardImageVideoGenerateTask(payload: {
  body: StoryboardVideoImageGenerateRequest
  onProgress?: (p: StoryboardVideoGenerateProgress) => void
  onSubmitted?: (p: { taskId: number }) => void
  notifyGlobalTasks?: boolean
}): Promise<StoryboardVideoGenerateResult> {
  return submitAndFollowStoryboardVideoTask({
    submit: () => userStoryboardGenerateVideoImage(payload.body),
    onProgress: payload.onProgress,
    onSubmitted: payload.onSubmitted,
    notifyGlobalTasks: payload.notifyGlobalTasks,
    progressMessage: '图生视频生成中…',
    submitErrorMessage: '提交图生视频失败'
  })
}

/** 多参方向出片：POST /api/user/storyboard/generate/video */
export async function runStoryboardMultiVideoGenerateTask(payload: {
  body: StoryboardVideoGenerateRequest
  onProgress?: (p: StoryboardVideoGenerateProgress) => void
  onSubmitted?: (p: { taskId: number }) => void
  notifyGlobalTasks?: boolean
}): Promise<StoryboardVideoGenerateResult> {
  return submitAndFollowStoryboardVideoTask({
    submit: () => userStoryboardGenerateVideo(payload.body),
    onProgress: payload.onProgress,
    onSubmitted: payload.onSubmitted,
    notifyGlobalTasks: payload.notifyGlobalTasks,
    progressMessage: '多参视频生成中…',
    submitErrorMessage: '提交多参视频失败'
  })
}

/** 首尾帧方向出片：POST /api/user/storyboard/generate/video/edge */
export async function runStoryboardEdgeVideoGenerateTask(payload: {
  body: StoryboardVideoEdgeGenerateRequest
  onProgress?: (p: StoryboardVideoGenerateProgress) => void
  onSubmitted?: (p: { taskId: number }) => void
  notifyGlobalTasks?: boolean
}): Promise<StoryboardVideoGenerateResult> {
  return submitAndFollowStoryboardVideoTask({
    submit: () => userStoryboardGenerateVideoEdge(payload.body),
    onProgress: payload.onProgress,
    onSubmitted: payload.onSubmitted,
    notifyGlobalTasks: payload.notifyGlobalTasks,
    progressMessage: '首尾帧视频生成中…',
    submitErrorMessage: '提交首尾帧视频失败'
  })
}

/** 宫格方向出片：POST /api/user/storyboard/generate/video/grid */
export async function runStoryboardGridVideoGenerateTask(payload: {
  body: StoryboardVideoGridGenerateRequest
  onProgress?: (p: StoryboardVideoGenerateProgress) => void
  onSubmitted?: (p: { taskId: number }) => void
  notifyGlobalTasks?: boolean
}): Promise<StoryboardVideoGenerateResult> {
  return submitAndFollowStoryboardVideoTask({
    submit: () => userStoryboardGenerateVideoGrid(payload.body),
    onProgress: payload.onProgress,
    onSubmitted: payload.onSubmitted,
    notifyGlobalTasks: payload.notifyGlobalTasks,
    progressMessage: '宫格视频生成中…',
    submitErrorMessage: '提交宫格视频失败'
  })
}

/** PARTIAL_FAILED 续生：POST /api/user/task/resume */
export async function resumeStoryboardVideoGenerateTask(payload: {
  taskId: number
  onProgress?: (p: StoryboardVideoGenerateProgress) => void
}): Promise<StoryboardVideoGenerateResult> {
  const taskId = Number(payload.taskId)
  if (!Number.isFinite(taskId) || taskId <= 0) {
    return { ok: false, errorMessage: '任务ID无效' }
  }
  return submitAndFollowStoryboardVideoTask({
    submit: () => userTaskResume({ taskId }) as Promise<StoryboardVideoGenerateData>,
    onProgress: payload.onProgress,
    progressMessage: '分镜视频续生中…',
    submitErrorMessage: '续生分镜视频失败'
  })
}

/** @deprecated 请使用 runStoryboardImageVideoGenerateTask 或 runStoryboardMultiVideoGenerateTask */
export const runStoryboardI2vGenerateTask = runStoryboardMultiVideoGenerateTask
