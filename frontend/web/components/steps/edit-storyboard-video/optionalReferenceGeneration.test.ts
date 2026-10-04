import { describe, expect, it, vi } from 'vitest'
import { createVideoModalReferenceCore } from './videoModalReferenceCore'
import { useVideoModalGenerateActions as attachVideoModalGenerateActions } from './useVideoModalGenerateActions'
import { buildVideoQuoteRequest } from './VideoConfigPanel'
import type { VideoModalCtx } from './types'

vi.mock('antd', () => ({ message: { warning: vi.fn() } }))

function state<T>(value: T) {
  return { value, get: () => value, set: vi.fn() }
}

function createContext() {
  const submit = vi.fn().mockResolvedValue(undefined)
  const saveSettings = vi.fn()
  const ctx = {
    currentStoryboardId: () => 123,
    currentSceneIndex: state(0),
    referenceImages: state([]),
    referenceVideos: state([]),
    referenceAudios: state([]),
    sceneImages: state([]),
    characterImages: state([]),
    propImages: state([]),
    otherImages: state([]),
    resolvedMultiParamPromptAssets: state([]),
    imageToVideoModel: state('image-model'),
    multiParamVideoModel: state('multi-model'),
    videoDuration: state(5),
    videoAspectRatio: state('16:9'),
    videoQuality: state('720p'),
    videoCount: state(1),
    cameraMovementDesc: state(''),
    multiParamShootingTechnique: state(null),
    submittedVideoPromptByStoryboardId: state({}),
    faceSwapEnabled: state(false),
    imageToVideoPromptPlain: () => '人物向前走',
    multiParamPromptPlain: () => '人物向前走',
    showImageToVideoGenerateLoadingGet: () => false,
    showMultiParamGenerateLoadingGet: () => false,
    collectReferenceImageUrls: () => [],
    resolveBaseImageRecordId: () => undefined,
    activeVideoRawModel: () => null,
    videoConfigShowDuration: () => true,
    videoConfigShowAudio: () => false,
    resolveCurrentGenerateAudio: () => undefined,
    store: () => ({ setStoryboardVideoGenerateSettings: saveSettings }),
    runStoryboardVideoGenerateForScene: submit
  } as unknown as VideoModalCtx
  Object.assign(ctx, createVideoModalReferenceCore(ctx))
  attachVideoModalGenerateActions(ctx)
  return { ctx, submit }
}

describe('分镜视频右侧生成的可选参考素材', () => {
  it('图生视频不上传参考图片时仍提交，保留服务端主图回落', async () => {
    const { ctx, submit } = createContext()

    await ctx.handleImageToVideoStartGenerate()

    expect(submit).toHaveBeenCalledOnce()
    expect(submit.mock.calls[0][1].submitImageVideoBody).toMatchObject({
      storyboardIds: [123],
      modelName: 'image-model',
      videoPrompt: '人物向前走'
    })
    expect(submit.mock.calls[0][1].submitImageVideoBody.images ?? []).toEqual([])
  })

  it('多参视频不上传图片、音频或视频时仍提交纯提示词', async () => {
    const { ctx, submit } = createContext()

    await ctx.handleMultiParamStartGenerate()

    expect(submit).toHaveBeenCalledOnce()
    expect(submit.mock.calls[0][1].submitMultiBody).toMatchObject({
      storyboardIds: [123],
      modelName: 'multi-model',
      videoPrompt: '人物向前走'
    })
    expect(submit.mock.calls[0][1].submitMultiBody.referenceOverrides).toBeUndefined()
    expect(submit.mock.calls[0][1].submitMultiBody.referenceVideoIds).toBeUndefined()
    expect(submit.mock.calls[0][1].submitMultiBody.referenceAudioIds).toBeUndefined()
  })

  it('上传参考图后仍拒绝超出图生视频的单张上限', () => {
    const { ctx } = createContext()
    expect(ctx.validateImageToVideoReferenceImages(['a', 'b'])).toBe(false)
  })

  it('传入参考图片、音频和视频时仍按原字段带入生成请求', async () => {
    const { ctx, submit } = createContext()
    Object.assign(ctx, {
      collectReferenceImageUrls: () => ['https://example.com/reference.png'],
      referenceAudios: state([{ kind: 'audio', audioSource: 'upload', referenceAudioId: 77 }]),
      referenceVideos: state([{ kind: 'video', referenceVideoRecordId: 88 }]),
      activeVideoRawModel: () => ({ capability: { supportsVideoInput: true, maxReferenceVideos: 2 } })
    })

    await ctx.handleImageToVideoStartGenerate()
    await ctx.handleMultiParamStartGenerate()

    expect(submit.mock.calls[0][1].submitImageVideoBody).toMatchObject({
      images: ['https://example.com/reference.png'],
      referenceAudioIds: [77]
    })
    expect(submit.mock.calls[1][1].submitMultiBody).toMatchObject({
      referenceAudioIds: [77],
      referenceVideoRecordIds: [88]
    })
  })

  it('不上传参考图时仍能取得与提交一致的图生视频报价参数', () => {
    const { ctx } = createContext()
    Object.assign(ctx, {
      props: () => ({ open: true }),
      leftActiveTab: state('imageToVideo')
    })

    expect(buildVideoQuoteRequest(ctx)).toMatchObject({
      quoteType: 'STORYBOARD_VIDEO_IMAGE',
      payload: { storyboardIds: [123], modelName: 'image-model', videoPrompt: '人物向前走' }
    })
    expect(buildVideoQuoteRequest(ctx)?.payload).not.toHaveProperty('images')
  })
})
