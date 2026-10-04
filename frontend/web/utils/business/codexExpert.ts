import type { ApiEnvelope } from '~/types/business-api'
import { request } from '~/utils/api'
import { unwrap } from '~/utils/business/shared'

export type CodexExpertMode =
  | 'script_audit'
  | 'asset_integrity'
  | 'storyboard'
  | 'visual_director'

export interface CodexExpertTask {
  taskId: string
  status: 'QUEUED' | 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | string
  modelName?: string | null
  textContent?: string | null
  errorMessage?: string | null
  userMessage?: string | null
  retryable?: boolean
}

export interface CodexExpertReviewRequest {
  mode: CodexExpertMode
  context: string
  question?: string
  projectId?: number | null
  episodeId?: number | null
}

export async function submitCodexExpertReview(
  body: CodexExpertReviewRequest
): Promise<CodexExpertTask> {
  const res = await request.post<ApiEnvelope<CodexExpertTask>>('/api/user/codex-expert/review', body)
  return unwrap(res)
}

export async function fetchCodexExpertStatus(taskId: string): Promise<CodexExpertTask> {
  const res = await request.post<ApiEnvelope<CodexExpertTask>>('/api/user/codex-expert/status', {
    taskId
  })
  return unwrap(res)
}
