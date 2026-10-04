import { describe, expect, it } from 'vitest'
import type { WorkData } from '~/types'
import { buildCodexExpertContext } from '~/utils/codexExpertContext'

function workData(script: string): WorkData {
  return {
    globalSetting: {
      title: '测试短剧',
      genre: '悬疑',
      style: '写实',
      description: '',
      complianceProfile: 'CN_MAINLAND',
      aspectRatio: '9:16',
      scriptType: 'plot',
      modelStrategy: 'economy',
      creationMode: 'pro',
      selectedStyle: null,
      styleSelectionTouched: false,
      styleLocked: false,
      myStyles: []
    },
    storyScript: { content: script },
    sceneCharacter: { characters: ['赵小刚'], scenes: ['村口'], props: ['旧手机'] },
    storyboardScript: { panels: [{ id: '1', title: '分镜1', scriptContent: '抬头看向村口' }] },
    storyboardVideo: { panels: [] },
    dubbing: { voiceActors: [], bgm: '', panels: [] }
  }
}

describe('buildCodexExpertContext', () => {
  it('removes script HTML and keeps current project metadata', () => {
    const context = buildCodexExpertContext({
      workTitle: '作品A',
      projectId: 2,
      episodeId: 1,
      routePath: '/create/scene-character',
      mode: 'script_audit',
      formData: workData('<p>第一场</p><p>冲突发生</p>')
    })
    expect(context).toContain('第一场')
    expect(context).toContain('冲突发生')
    expect(context).not.toContain('<p>')
    expect(context).toContain('"projectId": 2')
  })

  it('keeps assets ahead of a truncated long script in asset mode', () => {
    const context = buildCodexExpertContext({
      workTitle: '作品A',
      projectId: 2,
      episodeId: 1,
      routePath: '/create/scene-character',
      mode: 'asset_integrity',
      formData: workData('剧情'.repeat(50_000))
    })
    expect(context.length).toBeLessThanOrEqual(75_030)
    expect(context).toContain('赵小刚')
    expect(context).toContain('剧本过长')
  })
})
