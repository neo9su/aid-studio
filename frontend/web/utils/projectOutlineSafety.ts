export interface ProjectOutlineSafetyLocation {
  lineNumber: number
  section: string
  matchedText: string
}

export interface ProjectOutlineSafetyInspection {
  blocked: boolean
  minorLocations: ProjectOutlineSafetyLocation[]
  adultLocations: ProjectOutlineSafetyLocation[]
}

const HEADING = /^(#{1,6})\s+(.+?)\s*$/
const MINOR_AGE = /(?<!\d)(?:1[0-7]|[0-9])\s*(?:[-–—~至到]\s*\d{1,2}\s*)?(?:岁|周岁)/g
const ADULT_CONTENT = /情色|色情|性爱|性行为|行房|初夜|成人内容|A\s*级片|裸露/gi
const MAX_MINOR_LOCATIONS = 12
const MAX_ADULT_LOCATIONS = 6

function sectionPath(headings: Array<string | undefined>) {
  return headings.filter(Boolean).join(' / ') || '文档开头'
}

function collectMatches(
  line: string,
  pattern: RegExp,
  lineNumber: number,
  section: string
): ProjectOutlineSafetyLocation[] {
  pattern.lastIndex = 0
  return Array.from(line.matchAll(pattern), (match) => ({
    lineNumber,
    section,
    matchedText: match[0]
  }))
}

export function inspectProjectOutlineSafety(outline: string): ProjectOutlineSafetyInspection {
  const minorLocations: ProjectOutlineSafetyLocation[] = []
  const adultLocations: ProjectOutlineSafetyLocation[] = []
  const headings: Array<string | undefined> = new Array(6)
  const lines = String(outline || '').replace(/\r\n?/g, '\n').split('\n')

  lines.forEach((line, index) => {
    const headingMatch = line.match(HEADING)
    if (headingMatch) {
      const level = headingMatch[1].length
      headings[level - 1] = headingMatch[2].trim()
      headings.fill(undefined, level)
    }
    const section = sectionPath(headings)
    minorLocations.push(...collectMatches(line, MINOR_AGE, index + 1, section))
    adultLocations.push(...collectMatches(line, ADULT_CONTENT, index + 1, section))
  })

  return {
    blocked: minorLocations.length > 0 && adultLocations.length > 0,
    minorLocations,
    adultLocations
  }
}

function formatLocations(
  locations: ProjectOutlineSafetyLocation[],
  limit: number,
  kindLabel: string
) {
  const lines = locations.slice(0, limit).map(
    (location) =>
      `- 第${location.lineNumber}行 [${location.section}] 命中“${location.matchedText}”`
  )
  if (locations.length > limit) {
    lines.push(`- 另有 ${locations.length - limit} 处同类命中，请继续搜索${kindLabel}。`)
  }
  return lines.join('\n')
}

export function formatProjectOutlineSafetyNotice(inspection: ProjectOutlineSafetyInspection) {
  if (!inspection.blocked) return ''
  return [
    '检测到成人内容与未满18岁设定同时存在。',
    '检测值：0–17岁（含年龄区间下限小于18，如“17–18岁”）；明确18岁及以上不会命中。',
    '未满18岁命中位置：',
    formatLocations(inspection.minorLocations, MAX_MINOR_LOCATIONS, '0–17岁年龄文本'),
    '成人内容关键词命中位置：',
    formatLocations(inspection.adultLocations, MAX_ADULT_LOCATIONS, '成人内容关键词'),
    '建议：保留成人内容时，将相关人物明确设定为18岁以上；保留未成年人设定时，删除与其相关的成人内容。'
  ].join('\n')
}
