import { describe, expect, it } from 'vitest'

import type { UserAssetRpsRow } from '~/types/business-api'
import {
  buildCharacterExportDocument,
  buildCharacterExportCsv,
  matchCharacterImageFilesByRows,
  matchCharacterPhotoFiles,
  recommendedCharacterImageFilename,
  recommendedCharacterPhotoFilename
} from './characterBatchTransfer'

function file(name: string): File {
  return { name, type: 'image/png', lastModified: 1 } as File
}

describe('characterBatchTransfer', () => {
  const characters = ['角色1: 赵小刚', '角色2: 宋雨晴']
  const forms = {
    0: [{ name: '形态1: 山场装' }, { name: '形态2: 镇上装' }],
    1: [{ name: '形态1: 默认服装' }]
  }

  it('matches exported role and form filenames and allows role-only first-form names', () => {
    const matches = matchCharacterPhotoFiles(
      [file('赵小刚__镇上装.png'), file('宋雨晴.jpg'), file('陌生人.png')],
      characters,
      forms
    )

    expect(matches[0]).toMatchObject({
      status: 'matched',
      target: { characterIndex: 0, formIndex: 1 }
    })
    expect(matches[1]).toMatchObject({
      status: 'matched',
      target: { characterIndex: 1, formIndex: 0 }
    })
    expect(matches[2].status).toBe('unmatched')
  })

  it('does not repeat the role name in the recommended form filename', () => {
    expect(recommendedCharacterPhotoFilename('王丽', '王丽_初始形象')).toBe('王丽__初始形象.png')
  })

  it('marks duplicate files targeting the same form as conflicts', () => {
    const matches = matchCharacterPhotoFiles(
      [file('赵小刚__山场装.png'), file('赵小刚-山场装.jpg')],
      characters,
      forms
    )

    expect(matches.map((item) => item.status)).toEqual(['conflict', 'conflict'])
  })

  it('exports one CSV row per role form with description, prompt and import filename', () => {
    const rows: UserAssetRpsRow[] = [
      {
        id: 10,
        assetType: 'character',
        assetName: '角色1: 赵小刚',
        introduction: '17岁以上的农村青年',
        occupation: '农民',
        forms: [
          {
            id: 101,
            name: '形态1: 山场装',
            descriptions: '白色背心，花裤衩',
            images: [{ id: 1001, formId: 101, imageUrl: 'https://example.test/a.png', isUse: 1 }]
          }
        ]
      }
    ]

    const csv = buildCharacterExportCsv(rows)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('17岁以上的农村青年')
    expect(csv).toContain('白色背心，花裤衩')
    expect(csv).toContain(recommendedCharacterPhotoFilename('赵小刚', '山场装'))
    expect(csv).toContain('https://example.test/a.png')
  })

  it('exports MD generation instructions with costumes from the project outline', () => {
    const rows: UserAssetRpsRow[] = [
      {
        id: 10,
        assetType: 'character',
        assetName: '角色1: 赵小刚',
        introduction: '18岁以上的中国农村青年',
        forms: [{ id: 101, name: '形态1: 山场装', descriptions: '白色背心和花裤衩' }]
      }
    ]
    const outline = `## 赵小刚（男主）
- 年龄：18岁以上
- 服装变体：
  - A（第1-2章）：白色无袖背心和彩色大花裤衩
  - B（第3章起）：白色背心和蓝色牛仔裤
- **基础描述**：短黑发，晒黑皮肤

## 宋雨晴（女主）`

    const document = buildCharacterExportDocument(rows, outline, 'md')
    expect(document).toContain('总纲原始角色/服装设定')
    expect(document).toContain('A（第1-2章）')
    expect(document).toContain(
      recommendedCharacterImageFilename('赵小刚', 'main', '三视图')
    )
    expect(document).toContain(
      recommendedCharacterImageFilename('赵小刚', 'costume', 'B（第3章起）')
    )
    expect(document).toContain(
      recommendedCharacterImageFilename('赵小刚', 'expression', '愤怒')
    )
    expect(document).toContain('不得合并或改写文件名')
  })

  it('recognizes generated filenames and plans missing forms automatically', () => {
    const rows: UserAssetRpsRow[] = [
      {
        id: 10,
        assetType: 'character',
        assetName: '角色1: 赵小刚',
        aliasesName: '小刚',
        forms: [{ id: 101, name: '形态1: 山场装' }]
      }
    ]
    const matches = matchCharacterImageFilesByRows(
      [
        file('赵小刚__主形态__三视图.png'),
        file('赵小刚__服装__镇上装.png'),
        file('赵小刚__表情__愤怒.png'),
        file('赵小刚__单人图__山场装.png')
      ],
      rows
    )

    expect(matches[0]).toMatchObject({
      status: 'matched',
      target: { kind: 'main', formId: 101, makePrimary: true }
    })
    expect(matches[1]).toMatchObject({
      status: 'matched',
      target: { kind: 'costume', desiredFormName: '镇上装', formIndex: -1, makePrimary: false }
    })
    expect(matches[2]).toMatchObject({
      status: 'matched',
      target: { kind: 'expression', desiredFormName: '表情-愤怒', formIndex: -1 }
    })
    expect(matches[3]).toMatchObject({
      status: 'matched',
      target: { kind: 'single', desiredFormName: '山场装', formId: 101 }
    })
  })

  describe('单下划线“角色名_形态名”真实资产命名（角色资产_定稿）', () => {
    const rows: UserAssetRpsRow[] = [
      { id: 1, assetType: 'character', assetName: '周兰花', forms: [] },
      { id: 2, assetType: 'character', assetName: '赵有田', forms: [] },
      { id: 3, assetType: 'character', assetName: '宋雨晴', forms: [] },
      { id: 4, assetType: 'character', assetName: '孙兰兰', forms: [] },
      { id: 5, assetType: 'character', assetName: '刘程程', forms: [] },
      { id: 6, assetType: 'character', assetName: '赵小刚', forms: [] },
      { id: 7, assetType: 'character', assetName: '李翠花', forms: [] }
    ]

    const matchOne = (name: string) => matchCharacterImageFilesByRows([file(name)], rows)[0]

    it('“角色_三视图”归主形态并设为使用图', () => {
      expect(matchOne('赵有田_三视图.png')).toMatchObject({
        status: 'matched',
        target: { kind: 'main', variantName: '三视图', makePrimary: true, desiredFormName: '标准形象' }
      })
    })

    it('“角色_三视图v3”等带版本后缀的三视图独立成形态格，不占主形态', () => {
      expect(matchOne('周兰花_三视图v3.png')).toMatchObject({
        status: 'matched',
        target: { kind: 'form', variantName: '三视图v3' }
      })
    })

    it('“角色_服装A_细节”归服装，剥离版本字母保留细节名', () => {
      expect(matchOne('刘程程_服装A_白上衣丝袜高跟.png')).toMatchObject({
        status: 'matched',
        target: { kind: 'costume', variantName: '白上衣丝袜高跟', makePrimary: false }
      })
    })

    it('“角色_服装G”归服装', () => {
      expect(matchOne('刘程程_服装G.png')).toMatchObject({
        status: 'matched',
        target: { kind: 'costume', variantName: 'G', makePrimary: false }
      })
    })

    it('“角色_特写”归自由形态', () => {
      expect(matchOne('宋雨晴_特写.png')).toMatchObject({
        status: 'matched',
        target: { kind: 'form', variantName: '特写' }
      })
    })

    it('“角色_瑜伽服”等自由名归形态', () => {
      expect(matchOne('孙兰兰_瑜伽服.png')).toMatchObject({
        status: 'matched',
        target: { kind: 'form', variantName: '瑜伽服' }
      })
    })

    it('“角色_表情图”归表情', () => {
      expect(matchOne('赵小刚_表情图.png')).toMatchObject({
        status: 'matched',
        target: { kind: 'expression', desiredFormName: '表情' }
      })
    })

    it('“角色_微表情”归表情，作为具体类型保留为“表情-微表情”', () => {
      expect(matchOne('李翠花_微表情.png')).toMatchObject({
        status: 'matched',
        target: { kind: 'expression', desiredFormName: '表情-微表情' }
      })
    })

    it('“角色_单人图”归单人图', () => {
      expect(matchOne('赵小刚_单人图.png')).toMatchObject({
        status: 'matched',
        target: { kind: 'single', makePrimary: true }
      })
    })

    it('带“角色N: ”前缀的资产名也能按前缀命中', () => {
      const prefixed: UserAssetRpsRow[] = [
        { id: 20, assetType: 'character', assetName: '角色20: 赵有田', forms: [] }
      ]
      expect(matchCharacterImageFilesByRows([file('赵有田_三视图.png')], prefixed)[0]).toMatchObject({
        status: 'matched',
        target: { kind: 'main', makePrimary: true }
      })
    })
  })
})
