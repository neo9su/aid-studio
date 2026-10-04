import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pollUntilTaskTerminal } from '~/hooks/useStoryboardVideoGenerateTask'
import { resolveUserTaskTerminalOutcome } from '~/composables/useTaskSseFollow'
import { openRechargeModalFromInsufficientBalance } from '~/utils/api'

vi.mock('~/composables/useTaskSseFollow', () => ({
  resolveUserTaskTerminalOutcome: vi.fn()
}))
vi.mock('~/utils/api', () => ({
  openRechargeModalFromInsufficientBalance: vi.fn(),
  handleSseErrorRecharge: vi.fn()
}))

const mockResolve = vi.mocked(resolveUserTaskTerminalOutcome)
const mockRecharge = vi.mocked(openRechargeModalFromInsufficientBalance)

describe('pollUntilTaskTerminal（SSE 超时/断连后的兜底轮询）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('任务 ongoing：用 detail.eta 回填进度，直到终态才返回', async () => {
    mockResolve
      .mockResolvedValueOnce({
        kind: 'ongoing',
        taskId: 1,
        detail: { status: 'PROCESSING', eta: { displayProgress: 40, phase: 'RUNNING' } }
      } as never)
      .mockResolvedValueOnce({
        kind: 'succeeded',
        taskId: 1,
        detail: { status: 'SUCCEEDED' }
      } as never)

    const onProgress = vi.fn()
    const result = await pollUntilTaskTerminal(1, onProgress, { intervalMs: 1, maxMs: 2000 })

    expect(result.ok).toBe(true)
    // ongoing 那轮回填了 eta / progress
    expect(onProgress).toHaveBeenCalled()
    const first = onProgress.mock.calls[0][0]
    expect(first.progress).toBe(40)
    expect(first.eta).toMatchObject({ displayProgress: 40 })
    // 共查两次：第一次 ongoing、第二次终态
    expect(mockResolve).toHaveBeenCalledTimes(2)
  })

  it('任务直接 succeeded：返回成功终态', async () => {
    mockResolve.mockResolvedValue({
      kind: 'succeeded',
      taskId: 2,
      detail: { status: 'SUCCEEDED', resultData: '{"ok":1}' }
    } as never)

    const result = await pollUntilTaskTerminal(2, undefined, { intervalMs: 1, maxMs: 2000 })
    expect(result).toMatchObject({ ok: true, taskId: 2 })
  })

  it('任务 partial_failed：返回成功但标记 partial', async () => {
    mockResolve.mockResolvedValue({
      kind: 'partial_failed',
      taskId: 5,
      detail: { status: 'PARTIAL_FAILED', resultData: null }
    } as never)

    const result = await pollUntilTaskTerminal(5, undefined, { intervalMs: 1, maxMs: 2000 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.partial).toBe(true)
  })

  it('任务 failed：返回错误并触发充值提示', async () => {
    mockResolve.mockResolvedValue({
      kind: 'failed',
      taskId: 3,
      errorMessage: '余额不足'
    })

    const result = await pollUntilTaskTerminal(3, undefined, { intervalMs: 1, maxMs: 2000 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errorMessage).toBe('余额不足')
    expect(mockRecharge).toHaveBeenCalledWith('余额不足')
  })

  it('任务 cancelled：返回取消', async () => {
    mockResolve.mockResolvedValue({
      kind: 'cancelled',
      taskId: 4,
      message: '任务已取消'
    })

    const result = await pollUntilTaskTerminal(4, undefined, { intervalMs: 1, maxMs: 2000 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errorMessage).toBe('任务已取消')
    expect(mockRecharge).not.toHaveBeenCalled()
  })

  it('持续 ongoing 超过上限：回退为 deferred（可刷新恢复）', async () => {
    mockResolve.mockResolvedValue({
      kind: 'ongoing',
      taskId: 6,
      detail: { status: 'PROCESSING' }
    } as never)

    const result = await pollUntilTaskTerminal(6, undefined, { intervalMs: 1, maxMs: 50 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.deferred).toBe(true)
      expect(result.errorMessage).toContain('后台执行')
    }
  })
})
