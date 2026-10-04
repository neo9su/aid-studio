import { describe, expect, it } from 'vitest'
import {
  isScriptTextFileName,
  SCRIPT_UPLOAD_ACCEPT,
  validateScriptUploadFile
} from './scriptFileUpload'

describe('script file upload formats', () => {
  it('accepts txt and markdown file names case-insensitively', () => {
    expect(isScriptTextFileName('剧本.txt')).toBe(true)
    expect(isScriptTextFileName('剧本.MD')).toBe(true)
    expect(isScriptTextFileName('剧本.docx')).toBe(false)
  })

  it('exposes both text formats to the file picker', () => {
    expect(SCRIPT_UPLOAD_ACCEPT).toContain('.txt')
    expect(SCRIPT_UPLOAD_ACCEPT).toContain('.md')
    expect(SCRIPT_UPLOAD_ACCEPT).toContain('text/markdown')
  })

  it('validates markdown as a supported script file', () => {
    expect(validateScriptUploadFile(new File(['# 第一集'], '剧本.md', {
      type: 'text/markdown'
    }))).toBeNull()
  })
})
