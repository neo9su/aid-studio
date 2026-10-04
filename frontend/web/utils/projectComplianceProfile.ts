export type ProjectComplianceProfile =
  | 'PRIVATE_ADULT'
  | 'CN_MAINLAND'
  | 'US_PLATFORMS'

export interface ProjectComplianceProfileOption {
  value: ProjectComplianceProfile
  label: string
  badge: string
  description: string
}

export const DEFAULT_PROJECT_COMPLIANCE_PROFILE: ProjectComplianceProfile = 'CN_MAINLAND'

export const PROJECT_COMPLIANCE_PROFILE_OPTIONS: ProjectComplianceProfileOption[] = [
  {
    value: 'PRIVATE_ADULT',
    label: '私人自用（成人内容）',
    badge: '不公开',
    description: '允许成人向暴力或性主题，仅供自己观看；仍禁止未成年人色情、非自愿私密内容等违法或严重伤害内容。'
  },
  {
    value: 'CN_MAINLAND',
    label: '发布到中国大陆',
    badge: '推荐',
    description: '按 AI 短剧审核、备案和生成内容标识要求约束创作与发布检查。'
  },
  {
    value: 'US_PLATFORMS',
    label: '发布到美国',
    badge: 'YouTube / TikTok',
    description: '按 YouTube 与 TikTok 较严格的交集规则检查色情、暴力、未成年人和 AI 内容标识。'
  }
]

export function normalizeProjectComplianceProfile(
  value?: string | null,
  fallback: ProjectComplianceProfile = 'PRIVATE_ADULT'
): ProjectComplianceProfile {
  if (value === 'PRIVATE_ADULT' || value === 'CN_MAINLAND' || value === 'US_PLATFORMS') {
    return value
  }
  return fallback
}
