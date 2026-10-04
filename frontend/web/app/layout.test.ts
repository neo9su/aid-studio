/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'
import layoutSource from './layout.tsx?raw'

describe('RootLayout hydration boundary', () => {
  it('tolerates browser extensions adding attributes to body before hydration', () => {
    expect(layoutSource).toContain('<body suppressHydrationWarning>')
  })
})
