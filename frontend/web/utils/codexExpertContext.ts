import type { WorkData } from '~/types'
import type { CodexExpertMode } from '~/utils/business/codexExpert'
import { htmlToPlainPreserveLineBreaks } from '~/utils/htmlPlain'

const MAX_CONTEXT_CHARS = 75_000

export interface CodexExpertContextInput {
  workTitle: string
  projectId: number | null
  episodeId: number | null
  routePath: string
  mode: CodexExpertMode
  formData: WorkData
}

function compactPanels(formData: WorkData) {
  return formData.storyboardScript.panels.map((panel, index) => ({
    index: index + 1,
    title: panel.title,
    description: panel.description,
    duration: panel.duration,
    scriptContent: panel.scriptContent,
    dialogueText: panel.dialogueText
  }))
}

function compactVideoPanels(formData: WorkData) {
  return formData.storyboardVideo.panels.map((panel, index) => ({
    index: index + 1,
    title: panel.title,
    videoMode: panel.videoMode,
    detailDescription: panel.detailDescription,
    hasFinalVideo: Boolean(panel.finalVideoUrl)
  }))
}

/** 只发送创作文本和轻量状态，不发送图片、视频 URL 或生成历史。 */
export function buildCodexExpertContext(input: CodexExpertContextInput): string {
  const { formData } = input
  const project = {
    title: input.workTitle || formData.globalSetting.title || '未命名作品',
    projectId: input.projectId,
    episodeId: input.episodeId,
    currentPage: input.routePath,
    genre: formData.globalSetting.genre,
    style: formData.globalSetting.style,
    description: formData.globalSetting.description,
    aspectRatio: formData.globalSetting.aspectRatio,
    scriptType: formData.globalSetting.scriptType
  }
  const fullScript = htmlToPlainPreserveLineBreaks(formData.storyScript.content || '')
  const scriptLimit = input.mode === 'script_audit' ? 65_000 : input.mode === 'asset_integrity' ? 44_000 : 32_000
  const script =
    fullScript.length > scriptLimit
      ? `${fullScript.slice(0, scriptLimit)}\n[剧本过长，后续内容未带入本次审查]`
      : fullScript
  const assets = {
    characters: formData.sceneCharacter.characters,
    scenes: formData.sceneCharacter.scenes,
    props: formData.sceneCharacter.props
  }
  const storyboards = compactPanels(formData)
  const videoPlans = compactVideoPanels(formData)
  const dubbing = formData.dubbing.panels.map((panel, index) => ({
    index: index + 1,
    title: panel.title,
    dialogue: panel.dialogue,
    speakerRole: panel.speakerRole,
    status: panel.status
  }))
  const payload =
    input.mode === 'script_audit'
      ? { project, script, assets, storyboards }
      : input.mode === 'asset_integrity'
        ? { project, assets, script, storyboards }
        : { project, storyboards, videoPlans, assets, dubbing, script }
  const text = JSON.stringify(payload, null, 2)
  if (text.length <= MAX_CONTEXT_CHARS) return text
  return `${text.slice(0, MAX_CONTEXT_CHARS)}\n\n[上下文过长，已在此处截断]`
}
