import { describe, expect, it } from 'vitest'
import { formatImageGenerationFailure } from './imageGenerationFailure'

describe('formatImageGenerationFailure', () => {
  it('优先读取 Axios 响应中的具体原因', () => {
    const result = formatImageGenerationFailure({
      message: 'Request failed with status code 500',
      response: { data: { msg: '图片无效' } }
    })

    expect(result.reason).toBe('图片无效')
    expect(result.displayMessage).toContain('重新导入')
    expect(result.displayMessage).not.toContain('Request failed')
  })

  it('展示任务错误码、任务 ID 和可重试建议', () => {
    const result = formatImageGenerationFailure(
      {
        errorData: {
          userMessage: '生成未完成，稍后重试',
          errorCode: 'UPSTREAM_NETWORK_ERROR',
          retryable: true
        }
      },
      { taskId: 128 }
    )

    expect(result.displayMessage).toContain('UPSTREAM_NETWORK_ERROR')
    expect(result.displayMessage).toContain('检查模型服务连通性')
    expect(result.displayMessage).toContain('任务ID：128')
  })

  it('不再把“操作失败”原样展示给用户', () => {
    const result = formatImageGenerationFailure({ msg: '操作失败' })

    expect(result.reason).toBe('服务端未返回具体失败原因')
    expect(result.displayMessage).toContain('检查参考图、提示词和模型配置')
  })
})
