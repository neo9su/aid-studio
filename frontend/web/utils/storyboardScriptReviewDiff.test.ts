import { describe, expect, it } from 'vitest'
import { changedStoryboardFields, diffStoryboardText } from './storyboardScriptReviewDiff'

describe('storyboardScriptReviewDiff', () => {
  it('highlights only the changed middle text', () => {
    expect(diffStoryboardText('赵小刚走进院子。', '赵小刚快步走进院子。')).toEqual({
      beforePrefix: '赵小刚',
      beforeChanged: '',
      beforeSuffix: '走进院子。',
      afterPrefix: '赵小刚',
      afterChanged: '快步',
      afterSuffix: '走进院子。',
      changed: true
    })
  })

  it('summarizes changed storyboard fields', () => {
    expect(changedStoryboardFields(
      { title: '镜1', storyScript: '原文', dialogueText: '你好' },
      { title: '镜1', storyScript: '新文', dialogueText: '你好' }
    )).toEqual(['分镜内容'])
  })
})
