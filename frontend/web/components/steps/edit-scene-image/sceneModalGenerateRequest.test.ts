import { describe, expect, it } from 'vitest'

import {
  resolveSceneModalGenerationFormId,
  resolveSceneModalReferenceImages
} from './sceneModalGenerateRequest'

describe('resolveSceneModalReferenceImages', () => {
  it('uses the current canvas image when an image edit model has no explicit reference', () => {
    expect(
      resolveSceneModalReferenceImages({
        referenceImages: [],
        currentImageUrl: ' /media/current.png ',
        capabilityCode: 'image_to_image'
      })
    ).toEqual(['/media/current.png'])
  })

  it('keeps explicit references instead of adding the current canvas image', () => {
    expect(
      resolveSceneModalReferenceImages({
        referenceImages: [' /media/reference.png '],
        currentImageUrl: '/media/current.png',
        capabilityCode: 'image_to_image'
      })
    ).toEqual(['/media/reference.png'])
  })

  it('keeps text-to-image requests free of implicit references', () => {
    expect(
      resolveSceneModalReferenceImages({
        referenceImages: [],
        currentImageUrl: '/media/current.png',
        capabilityCode: 'text_to_image'
      })
    ).toEqual([])
  })
})

describe('resolveSceneModalGenerationFormId', () => {
  it('uses the form attached to the current image first', () => {
    expect(resolveSceneModalGenerationFormId({ rpsFormId: 16 }, [15, 16, 21], 2)).toBe(16)
  })

  it('uses the active form tab when the tab has no image yet', () => {
    expect(resolveSceneModalGenerationFormId(undefined, [15, 16, 21], 2)).toBe(21)
  })

  it('falls back to the first form when the preferred index is unavailable', () => {
    expect(resolveSceneModalGenerationFormId(undefined, [15, 16, 21], 9)).toBe(15)
  })
})
