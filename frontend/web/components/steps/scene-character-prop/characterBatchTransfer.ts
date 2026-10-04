import type { UserAssetRpsRow } from '~/types/business-api'
import { htmlToPlainPreserveLineBreaks } from '~/utils/htmlPlain'
import { getCharacterName, getFormName, settingEditorHtmlFromRpsMainRow } from './scpRowUtils'
import type { CharacterFormItem } from './types'

export type CharacterPhotoTarget = {
  characterIndex: number
  formIndex: number
  characterName: string
  formName: string
}

export type CharacterImageKind = 'main' | 'costume' | 'expression' | 'single' | 'form'

export type CharacterImageImportTarget = CharacterPhotoTarget & {
  assetId?: number
  formId?: number
  kind: CharacterImageKind
  variantName: string
  /** 形态不存在时，批量导入会用这个名称自动创建形态。 */
  desiredFormName: string
  /** 三视图及每个新形态的第一张图应成为该形态当前使用图。 */
  makePrimary: boolean
}

export type CharacterImageImportMatch = Omit<CharacterPhotoMatch, 'target'> & {
  target?: CharacterImageImportTarget
}

export type CharacterExportFormat = 'md' | 'txt'

export type CharacterPhotoMatch = {
  file: File
  status: 'matched' | 'unmatched' | 'conflict'
  target?: CharacterPhotoTarget
  reason?: string
}

function safeFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[\s_.\-—–·,，、:：;；()（）\[\]【】{}]+/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function formNameWithoutRepeatedCharacter(characterName: string, formName: string): string {
  const character = getCharacterName(characterName).trim()
  const form = getFormName(formName).trim()
  if (!character || !form.startsWith(character)) return form
  const suffix = form.slice(character.length).replace(/^[\s_.\-—–·:：]+/, '').trim()
  return suffix || form
}

export function recommendedCharacterPhotoFilename(characterName: string, formName: string): string {
  const character = safeFilePart(getCharacterName(characterName)) || '未命名角色'
  const form = safeFilePart(formNameWithoutRepeatedCharacter(characterName, formName)) || '默认形态'
  return `${character}__${form}.png`
}

export function recommendedCharacterImageFilename(
  characterName: string,
  kind: Exclude<CharacterImageKind, 'form'>,
  variantName: string
): string {
  const character = safeFilePart(getCharacterName(characterName)) || '未命名角色'
  const kindLabel =
    kind === 'main' ? '主形态' : kind === 'costume' ? '服装' : kind === 'expression' ? '表情' : '单人图'
  const variant = safeFilePart(variantName) || (kind === 'main' ? '三视图' : '默认')
  return `${character}__${kindLabel}__${variant}.png`
}

function findOutlineCharacterSection(outline: string, characterName: string): string {
  const name = getCharacterName(characterName).trim()
  if (!outline.trim() || !name) return ''
  const heading = new RegExp(`^#{2,4}\\s*${escapeRegExp(name)}(?:\\s*[（(].*?[)）])?\\s*$`, 'm')
  const match = heading.exec(outline)
  if (!match) return ''
  const start = match.index
  const tail = outline.slice(start + match[0].length)
  const next = /^#{2,4}\s+.+$/m.exec(tail)
  return outline.slice(start, next ? start + match[0].length + next.index : outline.length).trim()
}

type CostumeSpec = { name: string; description: string }

function outlineCostumes(section: string): CostumeSpec[] {
  if (!section) return []
  const lines = section.split(/\r?\n/)
  const results: CostumeSpec[] = []
  let inCostumeBlock = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (/^(?:[-*]\s*)?\*{0,2}服装(?:变体|后缀|设定)/.test(line)) {
      inCostumeBlock = true
      continue
    }
    if (inCostumeBlock && /^(?:[-*]\s*)?\*{0,2}(?:基础描述|音色|性格|人物关系)/.test(line)) {
      inCostumeBlock = false
    }
    if (!inCostumeBlock) continue
    const item = /^[-*]\s*([^：:]{1,40})[：:]\s*(.+)$/.exec(line)
    if (!item) continue
    const label = item[1].replace(/\*+/g, '').trim()
    const description = item[2].replace(/^`|`$/g, '').trim()
    if (!label || !description) continue
    results.push({ name: label, description })
  }
  const seen = new Set<string>()
  return results.filter((item) => {
    const key = normalizedName(`${item.name}:${item.description}`)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function formDescription(form: NonNullable<UserAssetRpsRow['forms']>[number]): string {
  return String(form.descriptions || form.promptText || form.prompt || form.summary || form.introduction || '').trim()
}

function roleDescription(row: UserAssetRpsRow): string {
  return htmlToPlainPreserveLineBreaks(settingEditorHtmlFromRpsMainRow(row, 'character')).trim()
}

function characterCostumes(row: UserAssetRpsRow, outlineSection: string): CostumeSpec[] {
  const fromForms = (row.forms ?? [])
    .map((form, index) => ({
      name: getFormName(String(form.name || '')).trim() || `形态${index + 1}`,
      description: formDescription(form)
    }))
    .filter((item) => !/^表情[-_：:]/.test(item.name))
  const combined = [...fromForms, ...outlineCostumes(outlineSection)]
  const seen = new Set<string>()
  return combined.filter((item) => {
    const key = normalizedName(item.name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function imagePrompt(
  kind: Exclude<CharacterImageKind, 'form'>,
  characterName: string,
  description: string,
  variantName: string,
  variantDescription: string
): string {
  const identity = `角色：${characterName}。固定人物身份与外貌：${description || '严格保持同一人物的脸型、五官、发型、年龄感和体型一致。'}`
  if (kind === 'main') {
    return `${identity}\n生成角色三视图设定图：同一角色、同一服装、同一比例，依次展示完整正面、标准侧面、完整背面；全身从头到脚不得裁切，纯白或浅灰无缝背景，均匀棚拍光，写实高清，禁止四宫格、禁止多人、禁止文字水印。服装：${variantDescription || variantName}。`
  }
  if (kind === 'costume') {
    return `生成“${characterName}”的服饰参考图，不出现人物脸部。服装名称：${variantName}。服装细节：${variantDescription || '严格按照角色设定中的材质、颜色、版型与配饰。'} 正面、背面和关键细节清楚可见，纯白背景，均匀棚拍光，写实高清，禁止改变颜色与款式，禁止文字水印。`
  }
  if (kind === 'expression') {
    return `${identity}\n生成单张表情参考图，表情为“${variantName}”，头肩近景，正面机位，脸部无遮挡，五官身份与主三视图完全一致，表情自然不过度夸张，纯白背景，均匀棚拍光，写实高清，禁止拼图、禁止多人、禁止文字水印。`
  }
  return `${identity}\n生成单人全身参考图。服装/形态：${variantName}；${variantDescription || '严格按照对应服装设定。'} 单人独立站立，正面轻微三分之二视角，从头到脚完整入镜，纯白背景，均匀棚拍光，写实高清，禁止三视图拼接、禁止多人、禁止文字水印。`
}

type ExportImageSpec = {
  kind: Exclude<CharacterImageKind, 'form'>
  variantName: string
  filename: string
  prompt: string
}

function characterExportSpecs(row: UserAssetRpsRow, outline: string): {
  characterName: string
  description: string
  outlineSection: string
  specs: ExportImageSpec[]
} {
  const characterName = getCharacterName(String(row.assetName || '')).trim() || '未命名角色'
  const description = roleDescription(row)
  const outlineSection = findOutlineCharacterSection(outline, characterName)
  const costumes = characterCostumes(row, outlineSection)
  const defaultCostume = costumes[0] ?? { name: '标准服装', description: '' }
  const outputCostumes = costumes.length ? costumes : [defaultCostume]
  const specs: ExportImageSpec[] = []
  const add = (
    kind: Exclude<CharacterImageKind, 'form'>,
    variantName: string,
    variantDescription: string
  ) => {
    specs.push({
      kind,
      variantName,
      filename: recommendedCharacterImageFilename(characterName, kind, variantName),
      prompt: imagePrompt(kind, characterName, description, variantName, variantDescription)
    })
  }
  add('main', '三视图', defaultCostume.description || defaultCostume.name)
  outputCostumes.forEach((costume) => {
    add('costume', costume.name, costume.description)
    add('single', costume.name, costume.description)
  })
  ;['中性', '微笑', '愤怒', '悲伤', '惊讶'].forEach((expression) => add('expression', expression, ''))
  return { characterName, description, outlineSection, specs }
}

/**
 * 导出给外部生图工具的完整任务书。文件名本身就是回传协议，重新导入时无需再选角色或形态。
 */
export function buildCharacterExportDocument(
  rows: UserAssetRpsRow[],
  projectOutline: string,
  format: CharacterExportFormat
): string {
  const markdown = format === 'md'
  const parts: string[] = []
  parts.push(markdown ? '# AID Studio 角色图片批量生成任务书' : 'AID Studio 角色图片批量生成任务书')
  parts.push(
    '生成要求：逐条生成下列图片；不得合并或改写文件名。下载图片后保持原文件名，回到 AID Studio 使用“批量导入角色图片”，系统会自动识别角色和形态。三视图会作为角色主形态图，其余图片自动归入服装、表情或单人图形态。'
  )
  parts.push('统一要求：所有图片保持同一角色身份一致；图片中不得出现文件名、说明文字、水印或额外人物。')

  rows.forEach((row, roleIndex) => {
    const exported = characterExportSpecs(row, projectOutline)
    parts.push(markdown ? `## ${roleIndex + 1}. ${exported.characterName}` : `\n========== ${roleIndex + 1}. ${exported.characterName} ==========`)
    parts.push(markdown ? `### 角色固定描述\n${exported.description || '暂无结构化角色描述，请以总纲角色设定为准。'}` : `角色固定描述：\n${exported.description || '暂无结构化角色描述，请以总纲角色设定为准。'}`)
    if (exported.outlineSection) {
      parts.push(markdown ? `### 总纲原始角色/服装设定\n${exported.outlineSection}` : `总纲原始角色/服装设定：\n${exported.outlineSection}`)
    }
    exported.specs.forEach((spec, imageIndex) => {
      const title = `${imageIndex + 1}. ${spec.kind === 'main' ? '主形态三视图' : spec.kind === 'costume' ? '服饰图' : spec.kind === 'expression' ? '表情图' : '单人图'}｜${spec.variantName}`
      parts.push(markdown ? `### ${title}` : `\n--- ${title} ---`)
      parts.push(`输出文件名：${spec.filename}`)
      parts.push(`提示词：\n${spec.prompt}`)
    })
  })
  return `\uFEFF${parts.join('\n\n').trim()}\n`
}

export function downloadCharacterExportDocument(
  content: string,
  projectId: number,
  format: CharacterExportFormat
): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `项目${projectId}-角色形态生图任务书.${format}`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function buildCharacterPhotoTargets(
  characters: string[],
  characterForms: Record<number, CharacterFormItem[]>
): CharacterPhotoTarget[] {
  return characters.flatMap((rawCharacterName, characterIndex) => {
    const forms = characterForms[characterIndex] ?? []
    return forms.map((form, formIndex) => ({
      characterIndex,
      formIndex,
      characterName: getCharacterName(rawCharacterName).trim() || rawCharacterName.trim(),
      formName: formNameWithoutRepeatedCharacter(rawCharacterName, form.name) || form.name.trim()
    }))
  })
}

/**
 * 文件名优先匹配“角色名__形态名”；只写角色名时绑定该角色的第一个形态。
 * 同一目标被多张图命中时标成冲突，避免批量导错角色或覆盖用户预期。
 */
export function matchCharacterPhotoFiles(
  files: File[],
  characters: string[],
  characterForms: Record<number, CharacterFormItem[]>
): CharacterPhotoMatch[] {
  const targets = buildCharacterPhotoTargets(characters, characterForms)
  const aliasMap = new Map<string, CharacterPhotoTarget[]>()
  const characterMap = new Map<string, CharacterPhotoTarget[]>()

  for (const target of targets) {
    const rawCharacter = characters[target.characterIndex] || target.characterName
    const rawForm = characterForms[target.characterIndex]?.[target.formIndex]?.name || target.formName
    const characterAliases = uniqueValues([target.characterName, rawCharacter])
    const formAliases = uniqueValues([target.formName, rawForm])
    for (const characterAlias of characterAliases) {
      for (const formAlias of formAliases) {
        const key = normalizedName(`${characterAlias}__${formAlias}`)
        aliasMap.set(key, [...(aliasMap.get(key) ?? []), target])
      }
    }
    if (target.formIndex === 0) {
      for (const characterAlias of characterAliases) {
        const key = normalizedName(characterAlias)
        characterMap.set(key, [...(characterMap.get(key) ?? []), target])
      }
    }
  }

  const provisional = files.map<CharacterPhotoMatch>((file) => {
    const stem = file.name.replace(/\.[^.]+$/, '')
    const key = normalizedName(stem)
    const candidates = uniqueTargetList([...(aliasMap.get(key) ?? []), ...(characterMap.get(key) ?? [])])
    if (candidates.length === 1) return { file, status: 'matched', target: candidates[0] }
    if (candidates.length > 1) {
      return { file, status: 'conflict', reason: '文件名对应多个角色或形态，请使用导出表中的推荐文件名' }
    }
    return {
      file,
      status: 'unmatched',
      reason: '未找到同名角色/形态；请命名为“角色名__形态名”或仅使用角色名'
    }
  })

  const targetCounts = new Map<string, number>()
  for (const item of provisional) {
    if (item.status !== 'matched' || !item.target) continue
    const key = `${item.target.characterIndex}-${item.target.formIndex}`
    targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1)
  }

  return provisional.map((item) => {
    if (item.status !== 'matched' || !item.target) return item
    const key = `${item.target.characterIndex}-${item.target.formIndex}`
    if ((targetCounts.get(key) ?? 0) <= 1) return item
    return { ...item, status: 'conflict', reason: '多张图片匹配到同一个角色形态，请保留一张或修改文件名' }
  })
}

function classifyImageKind(raw: string): CharacterImageKind | null {
  const value = normalizedName(raw)
  if (['主形态', '主图', '三视图', '角色三视图'].includes(value)) return 'main'
  if (['服装', '服饰', '服饰图', '换装'].includes(value)) return 'costume'
  if (['表情', '表情图', '情绪', '情绪神态'].includes(value)) return 'expression'
  if (['单人', '单人图', '全身', '全身图'].includes(value)) return 'single'
  return null
}

const KIND_LABELS: Array<[CharacterImageKind, string[]]> = [
  ['main', ['角色三视图', '主形态', '三视图', '主图']],
  ['costume', ['服饰图', '服饰', '服装', '换装']],
  ['expression', ['情绪神态', '情绪', '表情图', '表情', '微表情']],
  ['single', ['单人图', '单人', '全身图', '全身']]
]

/** 通用表情容器标签（无具体情绪）→ 归入通用“表情”形态；“微表情”等具体类型保留为“表情-<类型>”。 */
const GENERIC_EXPRESSION_LABELS = ['情绪神态', '情绪', '表情图', '表情']

/** 三视图带版本后缀（v2/v3 等）时，按独立形态格处理，不占用主形态。 */
function threeViewVariant(remainder: string): string | null {
  const value = normalizedName(remainder)
  if (value.includes('三视图')) return remainder.trim()
  return null
}

/** 去掉首个分隔符之后的内容，用于剥离形态名里的版本/细节后缀。 */
function afterFirstSeparator(value: string): string {
  const match = /[\s_.\-—–·:：,，、]/.exec(value)
  return match && match.index > 0 ? value.slice(match.index + 1) : value
}

/**
 * 解析“角色名_形态名”单下划线命名里角色名之后的 remainder。
 * 规则：仅“三视图”归主形态；“三视图v2/v3”等带后缀版本独立成形态格；
 * “服装X”（可带后缀）归服装；表情/微表情归表情；单人图归单人；其余自由名归形态。
 */
function classifyCharacterImageKind(remainder: string): { kind: CharacterImageKind; variantName: string } {
  const trimmed = remainder.trim()
  const threeView = threeViewVariant(remainder)
  if (threeView) {
    return normalizedName(threeView) === '三视图'
      ? { kind: 'main', variantName: '三视图' }
      : { kind: 'form', variantName: threeView }
  }
  for (const [kind, labels] of KIND_LABELS) {
    for (const label of labels) {
      if (trimmed.startsWith(label)) {
        let variant = trimmed.slice(label.length).trim()
        if (kind === 'expression') {
          // 通用容器（表情图/表情/情绪…）无具体情绪 → 通用“表情”形态；
          // “微表情”等具体类型保留为“表情-<类型>”，避免与“表情图”撞同一个形态。
          if (GENERIC_EXPRESSION_LABELS.includes(trimmed)) variant = ''
          else if (variant) variant = afterFirstSeparator(variant)
          else variant = label
        }
        if (kind === 'costume') variant = afterFirstSeparator(variant)
        return { kind, variantName: variant }
      }
    }
  }
  return { kind: 'form', variantName: trimmed }
}

/** 按“角色名/别名最长前缀优先”在角色资产里找前缀命中的角色，避免王丽抢王丽娟。 */
function matchRoleByPrefix(
  normalizedStem: string,
  entries: Array<{ key: string; value: Array<{ row: UserAssetRpsRow; characterIndex: number; characterName: string }> }>
): Array<{ row: UserAssetRpsRow; characterIndex: number; characterName: string }> {
  let bestLength = 0
  const best = new Map<number, { row: UserAssetRpsRow; characterIndex: number; characterName: string }>()
  for (const entry of entries) {
    if (!normalizedStem.startsWith(entry.key)) continue
    if (entry.key.length > bestLength) {
      bestLength = entry.key.length
      best.clear()
    } else if (entry.key.length < bestLength) {
      continue
    }
    // 同长度命中：按 characterIndex 去重，避免同角色多别名被误判为冲突。
    for (const value of entry.value) best.set(value.characterIndex, value)
  }
  return Array.from(best.values())
}

function resolveKindTarget(
  row: UserAssetRpsRow,
  kind: CharacterImageKind,
  variantName: string
): { kind: CharacterImageKind; variantName: string; desiredFormName: string; formIndex: number } {
  if (kind === 'main') {
    const formIndex = (row.forms ?? []).length ? 0 : -1
    return {
      kind,
      variantName: '三视图',
      desiredFormName: formIndex >= 0
        ? getFormName(String(row.forms?.[0]?.name || '')).trim() || '标准形象'
        : '标准形象',
      formIndex
    }
  }
  if (kind === 'expression') {
    const desiredFormName = variantName ? `表情-${variantName}` : '表情'
    return { kind, variantName, desiredFormName, formIndex: findFormIndex(row, desiredFormName) }
  }
  const formIndex = findFormIndex(row, variantName)
  return {
    kind,
    variantName,
    desiredFormName: formIndex >= 0
      ? getFormName(String(row.forms?.[formIndex]?.name || '')).trim() || variantName
      : variantName,
    formIndex
  }
}

function findFormIndex(row: UserAssetRpsRow, wantedName: string): number {
  const wanted = normalizedName(wantedName)
  if (!wanted) return -1
  return (row.forms ?? []).findIndex((form) => {
    const name = getFormName(String(form.name || '')).trim()
    const normalized = normalizedName(name)
    return normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized)
  })
}

/**
 * 解析新版三段式文件名，同时兼容“角色名__形态名”、仅角色名，以及单下划线“角色名_形态名”
 * （外部生图工具常用命名，按角色名/别名最长前缀匹配后自动归类形态）。
 * 允许形态尚不存在；调用方可按 desiredFormName 创建后直接绑定图片。
 */
export function matchCharacterImageFilesByRows(
  files: File[],
  rows: UserAssetRpsRow[]
): CharacterImageImportMatch[] {
  type RoleEntry = { row: UserAssetRpsRow; characterIndex: number; characterName: string }
  const roleMap = new Map<string, RoleEntry[]>()
  const roleAliases: Array<{ key: string; value: RoleEntry[] }> = []
  rows.forEach((row, characterIndex) => {
    const characterName = getCharacterName(String(row.assetName || '')).trim()
    const aliases = uniqueValues([
      characterName,
      String(row.assetName || ''),
      ...String(row.aliasesName || '').split(/[,，、/]/)
    ])
    const entry: RoleEntry = { row, characterIndex, characterName }
    aliases.forEach((alias) => {
      const key = normalizedName(alias)
      if (!key) return
      roleMap.set(key, [...(roleMap.get(key) ?? []), entry])
      // 每个别名各作为一条前缀键，保证任一别名都能作为“角色名_形态名”的前缀命中。
      roleAliases.push({ key, value: [entry] })
    })
  })

  const buildTarget = (
    file: File,
    entry: { row: UserAssetRpsRow; characterIndex: number; characterName: string },
    kind: CharacterImageKind,
    variantName: string
  ): CharacterImageImportMatch => {
    const { row, characterIndex, characterName } = entry
    const resolved = resolveKindTarget(row, kind, variantName)
    const form = resolved.formIndex >= 0 ? row.forms?.[resolved.formIndex] : undefined
    return {
      file,
      status: 'matched',
      target: {
        characterIndex,
        formIndex: resolved.formIndex,
        characterName,
        formName: resolved.desiredFormName,
        assetId: Number(row.id),
        formId: form?.id != null ? Number(form.id) : undefined,
        kind: resolved.kind,
        variantName: resolved.variantName,
        desiredFormName: resolved.desiredFormName,
        makePrimary: resolved.kind !== 'costume'
      }
    }
  }

  const provisional = files.map<CharacterImageImportMatch>((file) => {
    const stem = file.name.replace(/\.[^.]+$/, '').trim()
    const parts = stem.split('__').map((part) => part.trim()).filter(Boolean)
    const roleKey = normalizedName(parts[0] || stem)
    const roleCandidates = roleMap.get(roleKey) ?? []

    // 主路径：“角色__类别__变体” / “角色__形态名” / 仅角色名（含“角色名_形态名”整段误入时的兼容）。
    if (roleCandidates.length === 1) {
      const entry = roleCandidates[0]
      const explicitKind = parts.length >= 3 ? classifyImageKind(parts[1]) : null
      let kind: CharacterImageKind = explicitKind ?? 'form'
      let variantName = ''
      if (parts.length >= 3 && explicitKind) variantName = parts.slice(2).join('__')
      else if (parts.length >= 2) variantName = parts.slice(1).join('__')
      else kind = 'main'
      if (kind === 'main') variantName = variantName || '三视图'
      if (!variantName) variantName = '默认形态'
      return buildTarget(file, entry, kind, variantName)
    }
    if (roleCandidates.length > 1) {
      return {
        file,
        status: 'conflict',
        reason: '角色名称对应多个资产，请使用唯一角色名称'
      }
    }

    // 兜底路径：单下划线“角色名_形态名”，按角色名/别名最长前缀匹配，remainder 按形态名规则归类。
    const normalizedStem = normalizedName(stem)
    const prefixCandidates = matchRoleByPrefix(normalizedStem, roleAliases)
    if (prefixCandidates.length === 1) {
      const entry = prefixCandidates[0]
      // 剥掉角色名与形态名之间的分隔符（用户文件用“角色名_形态名”），否则前导“_”会让 startsWith 失配。
      const remainder = stem.slice(entry.characterName.length).replace(/^[\s_.\-—–·:：,，、]+/, '')
      const { kind, variantName } = classifyCharacterImageKind(remainder)
      // 表情无具体情绪时映射为通用“表情”形态，不能套用“默认形态”兜底。
      return buildTarget(file, entry, kind, kind === 'expression' ? variantName : variantName || '默认形态')
    }
    if (prefixCandidates.length > 1) {
      return {
        file,
        status: 'conflict',
        reason: '文件名前缀对应多个角色，请使用唯一角色名称'
      }
    }
    return {
      file,
      status: 'unmatched',
      reason: '未找到同名角色；请命名为“角色名_形态名”或“角色名__形态名”'
    }
  })

  const semanticCounts = new Map<string, number>()
  provisional.forEach((item) => {
    if (item.status !== 'matched' || !item.target) return
    const key = `${item.target.assetId}:${item.target.kind}:${normalizedName(item.target.variantName)}`
    semanticCounts.set(key, (semanticCounts.get(key) ?? 0) + 1)
  })
  return provisional.map((item) => {
    if (item.status !== 'matched' || !item.target) return item
    const key = `${item.target.assetId}:${item.target.kind}:${normalizedName(item.target.variantName)}`
    if ((semanticCounts.get(key) ?? 0) <= 1) return item
    return { ...item, status: 'conflict', reason: '存在同一角色、类别和形态的重复图片，请保留一张' }
  })
}

function uniqueTargetList(targets: CharacterPhotoTarget[]): CharacterPhotoTarget[] {
  const byKey = new Map<string, CharacterPhotoTarget>()
  for (const target of targets) {
    byKey.set(`${target.characterIndex}-${target.formIndex}`, target)
  }
  return Array.from(byKey.values())
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function buildCharacterExportCsv(rows: UserAssetRpsRow[]): string {
  const header = [
    '角色ID',
    '角色名称',
    '角色描述',
    '形态ID',
    '形态名称',
    '生图提示词',
    '推荐照片文件名',
    '当前照片URL'
  ]
  const body: string[][] = []

  for (const row of rows) {
    const characterName = getCharacterName(String(row.assetName || '')).trim() || '未命名角色'
    const description = htmlToPlainPreserveLineBreaks(
      settingEditorHtmlFromRpsMainRow(row, 'character')
    ).trim()
    const forms = Array.isArray(row.forms) ? row.forms : []
    if (forms.length === 0) {
      body.push([String(row.id || ''), characterName, description, '', '', '', '', ''])
      continue
    }
    forms.forEach((form, formIndex) => {
      const formName = getFormName(String(form.name || '')).trim() || `形态${formIndex + 1}`
      const prompt = String(form.descriptions || form.promptText || '').trim()
      const currentImage =
        form.images?.find((image) => Number(image.isUse) === 1)?.imageUrl ||
        form.images?.find((image) => String(image.imageUrl || '').trim())?.imageUrl ||
        form.imageUrl ||
        ''
      body.push([
        String(row.id || ''),
        characterName,
        description,
        String(form.id || ''),
        formName,
        prompt,
        recommendedCharacterPhotoFilename(characterName, formName),
        String(currentImage || '')
      ])
    })
  }

  return `\uFEFF${[header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}

export function downloadCharacterExportCsv(csv: string, projectId: number): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `项目${projectId}-角色描述与提示词.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
