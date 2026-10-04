import type {
  AssetExtractScope,
  AssetExtractType,
  UserAssetExtractParallelRequest
} from '~/types/business-api'
import type { RouteLikeLocation } from '~/types/routeLike'
import type { ExtractModelCodes } from '~/utils/extractAgentBiz'
import { buildParallelExtractSubmitPayload } from '~/utils/projectGenConfig'
import { resolveStoryScriptSaveContext } from '~/utils/storyScriptSaveContext'

type AssetExtractCreationStore = Parameters<typeof resolveStoryScriptSaveContext>[0]

interface BuildAssetExtractSubmitBodyOptions {
  store: AssetExtractCreationStore
  route: RouteLikeLocation
  extractTypes: AssetExtractType[]
  modelCodes: ExtractModelCodes
  manualModelPickByKind?: Partial<Record<AssetExtractType, boolean>>
  overwrite?: boolean
  extractScope?: AssetExtractScope
}

/** 后端约束：PROJECT_FULL 只能单独提交角色，避免场景/道具失去剧集归属。 */
export function resolveAssetExtractScopeForTypes(
  requestedScope: AssetExtractScope | undefined,
  extractTypes: AssetExtractType[]
): AssetExtractScope {
  return requestedScope === 'PROJECT_FULL' &&
    extractTypes.length === 1 &&
    extractTypes[0] === 'character'
    ? 'PROJECT_FULL'
    : requestedScope === 'PROJECT_OUTLINE'
      ? 'PROJECT_OUTLINE'
      : 'EPISODE_INCREMENTAL'
}

/**
 * 构造资产提取真正提交给 /asset/extract/parallel 的请求体。
 * 报价与提交必须共用本函数，避免弹窗展示态与项目最终生成配置不一致。
 */
export async function buildAssetExtractSubmitBody(
  options: BuildAssetExtractSubmitBodyOptions
): Promise<UserAssetExtractParallelRequest | null> {
  const context = await resolveStoryScriptSaveContext(options.store, options.route)
  if (!context) return null

  const extractTypes = [...options.extractTypes]
  const extractScope = resolveAssetExtractScopeForTypes(options.extractScope, extractTypes)
  const manualModelOverrides: Partial<Record<AssetExtractType, string>> = {}
  for (const type of extractTypes) {
    if (!options.manualModelPickByKind?.[type]) continue
    const modelCode = String(options.modelCodes[type] || '').trim()
    if (modelCode) manualModelOverrides[type] = modelCode
  }

  const configured = await buildParallelExtractSubmitPayload(
    context.projectId,
    extractTypes,
    manualModelOverrides
  )
  return {
    projectId: context.projectId,
    episodeId: context.episodeId,
    extractTypes,
    extractScope,
    agentCodes: configured.agentCodes,
    ...(configured.modelCodes ? { modelCodes: configured.modelCodes } : {}),
    overwrite: options.overwrite === true
  }
}
