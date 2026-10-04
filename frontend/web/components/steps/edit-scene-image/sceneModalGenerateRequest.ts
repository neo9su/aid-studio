import type { UserAssetExtractFormGenerateCreationImageRequest } from '~/types/business-api'

export interface ResolveSceneModalReferenceImagesInput {
  referenceImages: readonly string[]
  currentImageUrl?: unknown
  capabilityCode?: unknown
}

/**
 * 图片编辑模型没有显式参考图时，以当前画布图片作为编辑底图。
 * 文生图模型仍保持零参考图，避免无意中改变其生成语义。
 */
export function resolveSceneModalReferenceImages(
  input: ResolveSceneModalReferenceImagesInput
): string[] {
  const explicit = input.referenceImages
    .map((url) => String(url || '').trim())
    .filter(Boolean)
  if (explicit.length > 0) return explicit

  const capabilityCode = String(input.capabilityCode || '').trim().toLowerCase()
  if (capabilityCode !== 'image_to_image') return []

  const currentImageUrl = String(input.currentImageUrl || '').trim()
  return currentImageUrl ? [currentImageUrl] : []
}

export function resolveSceneModalGenerationFormId(
  currentImage: Record<string, unknown> | null | undefined,
  activeFormIds: readonly number[],
  preferredFormIndex = 0
): number | null {
  const current = Number(currentImage?.rpsFormId)
  if (Number.isFinite(current) && current > 0) return current
  const preferred = Number(activeFormIds[preferredFormIndex])
  if (Number.isFinite(preferred) && preferred > 0) return preferred
  const fallback = Number(activeFormIds[0])
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null
}

export function buildSceneModalGenerateRequest(
  input: UserAssetExtractFormGenerateCreationImageRequest
): UserAssetExtractFormGenerateCreationImageRequest {
  const referenceImages = (input.referenceImages || [])
    .map((url) => String(url || '').trim())
    .filter(Boolean)
  return {
    formId: Number(input.formId),
    genMode: input.genMode,
    ...(referenceImages.length ? { referenceImages } : {}),
    prompt: String(input.prompt || '').trim(),
    modelCode: String(input.modelCode || '').trim(),
    aspectRatio: String(input.aspectRatio || '').trim() || '1:1',
    size: String(input.size || '').trim().toUpperCase() || '2K',
    imageCount: Math.max(1, Math.min(4, Number(input.imageCount) || 1))
  }
}
