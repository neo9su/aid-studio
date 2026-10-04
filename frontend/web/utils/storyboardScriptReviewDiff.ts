export interface StoryboardTextDiff {
  beforePrefix: string
  beforeChanged: string
  beforeSuffix: string
  afterPrefix: string
  afterChanged: string
  afterSuffix: string
  changed: boolean
}

/**
 * 面向中文分镜的轻量字符差异：保留公共前后缀，突出中间真正变化的片段。
 * 不重排文本，也不依赖浏览器 DOM，便于测试和 SSR。
 */
export function diffStoryboardText(beforeValue?: string | null, afterValue?: string | null): StoryboardTextDiff {
  const before = String(beforeValue ?? '')
  const after = String(afterValue ?? '')
  if (before === after) {
    return {
      beforePrefix: before,
      beforeChanged: '',
      beforeSuffix: '',
      afterPrefix: after,
      afterChanged: '',
      afterSuffix: '',
      changed: false
    }
  }

  let prefixLength = 0
  const maxPrefix = Math.min(before.length, after.length)
  while (prefixLength < maxPrefix && before[prefixLength] === after[prefixLength]) {
    prefixLength += 1
  }

  let suffixLength = 0
  const maxSuffix = Math.min(before.length - prefixLength, after.length - prefixLength)
  while (
    suffixLength < maxSuffix &&
    before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  const beforeEnd = suffixLength ? before.length - suffixLength : before.length
  const afterEnd = suffixLength ? after.length - suffixLength : after.length
  return {
    beforePrefix: before.slice(0, prefixLength),
    beforeChanged: before.slice(prefixLength, beforeEnd),
    beforeSuffix: before.slice(beforeEnd),
    afterPrefix: after.slice(0, prefixLength),
    afterChanged: after.slice(prefixLength, afterEnd),
    afterSuffix: after.slice(afterEnd),
    changed: true
  }
}

export function changedStoryboardFields(
  original: { title?: string | null; storyScript?: string | null; dialogueText?: string | null } | null,
  suggestion: { title?: string | null; storyScript?: string | null; dialogueText?: string | null } | null
): string[] {
  if (!original) return ['新增镜头']
  if (!suggestion) return ['建议合并']
  const changed: string[] = []
  if (String(original.title ?? '') !== String(suggestion.title ?? '')) changed.push('标题')
  if (String(original.storyScript ?? '') !== String(suggestion.storyScript ?? '')) changed.push('分镜内容')
  if (String(original.dialogueText ?? '') !== String(suggestion.dialogueText ?? '')) changed.push('台词')
  return changed.length ? changed : ['格式整理']
}
