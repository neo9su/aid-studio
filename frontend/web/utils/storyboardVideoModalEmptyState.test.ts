/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'
import modalSource from '../components/steps/EditStoryboardVideoModal.tsx?raw'
import panelSource from '../components/steps/edit-storyboard-video/VideoStagePanels.tsx?raw'

describe('storyboard video modal empty state', () => {
  it('surfaces the current storyboard generation error instead of a generic empty hint', () => {
    expect(modalSource).toContain('storyboardPanelVideoGenErrorByStoryboardId')
    expect(panelSource).toContain('生成失败：${emptyError}')
  })
})
