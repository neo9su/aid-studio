import type { UserModelListItem } from '~/types/business-api'
import { resolveCapabilityRecord } from '~/utils/modelCapability'
import {
  formatAssetApiPlaceholder,
  formatVideoApiPlaceholder,
  type PromptAssetItem
} from '~/utils/storyboardPromptAssetRef'
import type { ReferenceMediaItem } from '~/utils/referenceMediaItem'

export function supportsFaceSwap(item?: UserModelListItem | null): boolean {
  return resolveCapabilityRecord(item).supportsFaceSwap === true
}

export function buildFaceSwapExecutionPrompt(
  originalPrompt: string,
  source: PromptAssetItem,
  target: ReferenceMediaItem
): string {
  const sourceTag = formatAssetApiPlaceholder(source.imageIndex, source.name)
  const targetTag = formatVideoApiPlaceholder(1, target.name)
  const instruction = `${sourceTag} 仅作为源人物面部身份；${targetTag} 作为目标视频。只替换目标视频中第一个人物的面部身份，严格保留原动作、表情节奏、镜头、服装、身体、背景、时长和原音轨。`
  // 编辑器原文保持不变；仅在提交副本里移除旧素材标签，防止历史引用把换脸源扩成多张图。
  const original = String(originalPrompt || '')
    .replace(/@(?:图片|视频|音频)\d+\[[^\]]*\]/g, '')
    .replace(/<(?:Picture|Video|Audio)\s+\d+>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return original ? `${instruction}\n${original}` : instruction
}
