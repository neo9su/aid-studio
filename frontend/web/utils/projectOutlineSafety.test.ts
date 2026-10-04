import { describe, expect, it } from 'vitest'
import {
  formatProjectOutlineSafetyNotice,
  inspectProjectOutlineSafety
} from './projectOutlineSafety'

describe('projectOutlineSafety', () => {
  it('reports exact sections and lines during outline import', () => {
    const inspection = inspectProjectOutlineSafety([
      '## 项目信息',
      '类型：A 级片',
      '## 角色设定',
      '### 主角',
      '年龄：17–18岁'
    ].join('\n'))
    const notice = formatProjectOutlineSafetyNotice(inspection)

    expect(inspection.blocked).toBe(true)
    expect(notice).toContain('第5行 [角色设定 / 主角] 命中“17–18岁”')
    expect(notice).toContain('第2行 [项目信息] 命中“A 级片”')
  })

  it('does not treat adult ages as minors', () => {
    expect(inspectProjectOutlineSafety('角色22岁；类型：成人内容').blocked).toBe(false)
    expect(inspectProjectOutlineSafety('角色18岁；类型：A 级片').blocked).toBe(false)
  })
})
