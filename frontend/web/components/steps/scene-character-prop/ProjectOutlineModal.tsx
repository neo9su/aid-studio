'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Button, Input, Modal, Space, Typography, message } from 'antd'
import { FileTextOutlined, UploadOutlined } from '@ant-design/icons'
import { userProjectDetail, userProjectUpdate } from '~/utils/businessApi'
import {
  formatProjectOutlineSafetyNotice,
  inspectProjectOutlineSafety
} from '~/utils/projectOutlineSafety'
import {
  normalizeProjectComplianceProfile,
  type ProjectComplianceProfile
} from '~/utils/projectComplianceProfile'
import './project-outline-modal.css'

const MAX_OUTLINE_CHARS = 100_000

interface ProjectOutlineModalProps {
  open: boolean
  projectId: number | null
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function ProjectOutlineModal({ open, projectId, onOpenChange, onSaved }: ProjectOutlineModalProps) {
  const [outline, setOutline] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [complianceProfile, setComplianceProfile] =
    useState<ProjectComplianceProfile>('CN_MAINLAND')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const acknowledgedPrivateNoticeRef = useRef('')

  useEffect(() => {
    if (!open || !projectId) return
    let cancelled = false
    setLoading(true)
    void userProjectDetail(projectId)
      .then((project) => {
        if (!cancelled) {
          setOutline(String(project.projectOutline || ''))
          setComplianceProfile(normalizeProjectComplianceProfile(project.complianceProfile, 'CN_MAINLAND'))
          acknowledgedPrivateNoticeRef.current = ''
        }
      })
      .catch((error: unknown) => {
        const err = error as { msg?: string; message?: string }
        if (!cancelled) message.error(err?.msg || err?.message || '加载项目总纲失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  const inspectAndNotify = async (text: string, allowPrivateContinue: boolean) => {
    const inspection = inspectProjectOutlineSafety(text)
    if (!inspection.blocked) return true
    const detail = formatProjectOutlineSafetyNotice(inspection)
    const noticeContent = (
      <div style={{ maxHeight: '58vh', overflow: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
        {detail}
        {complianceProfile === 'PRIVATE_ADULT'
          ? '\n\n私人自用模式仅作提醒，不阻止保存总纲或初始化资产；后续模型仍可能执行其自身的安全规则。'
          : ''}
      </div>
    )

    if (complianceProfile !== 'PRIVATE_ADULT') {
      Modal.error({
        title: '当前发布模式下，总纲未通过安全校验',
        width: 760,
        okText: '知道了，修改总纲',
        content: noticeContent
      })
      return false
    }

    if (acknowledgedPrivateNoticeRef.current === text) return true
    if (!allowPrivateContinue) {
      Modal.warning({
        title: '私人自用模式风险提醒（不会阻止使用）',
        width: 760,
        okText: '知道了，继续编辑',
        content: noticeContent,
        onOk: () => {
          acknowledgedPrivateNoticeRef.current = text
        }
      })
      return true
    }

    return await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: '私人自用模式风险提醒（不会阻止使用）',
        width: 760,
        okText: '仍然保存并继续',
        cancelText: '返回修改',
        content: noticeContent,
        onOk: () => {
          acknowledgedPrivateNoticeRef.current = text
          resolve(true)
        },
        onCancel: () => resolve(false)
      })
    })
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.(txt|md)$/i.test(file.name)) {
      message.warning('总纲仅支持 .txt 或 .md 文件')
      return
    }
    const text = await file.text()
    if (text.length > MAX_OUTLINE_CHARS) {
      message.warning('项目总纲不能超过10万字')
      return
    }
    setOutline(text)
    acknowledgedPrivateNoticeRef.current = ''
    void inspectAndNotify(text, false)
  }

  const handleSave = async () => {
    if (!projectId || saving) return
    const normalized = outline.trim()
    if (!normalized) {
      message.warning('请填写或导入项目总纲')
      return
    }
    if (!(await inspectAndNotify(normalized, true))) return
    setSaving(true)
    try {
      await userProjectUpdate({ id: projectId, projectOutline: normalized })
      message.success('项目总纲已保存，可初始化项目资产')
      onOpenChange(false)
      onSaved?.()
    } catch (error: unknown) {
      const err = error as { msg?: string; message?: string }
      message.error(err?.msg || err?.message || '保存项目总纲失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      width={760}
      title={
        <Space>
          <FileTextOutlined />
          <span>项目总纲 / 资产圣经</span>
        </Space>
      }
      okText="保存总纲"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: loading || !outline.trim() }}
      onOk={() => void handleSave()}
      onCancel={() => onOpenChange(false)}
      destroyOnHidden
    >
      <div className="project-outline-modal__body">
        <Typography.Paragraph type="secondary">
          总纲独立于分集剧本。建议包含角色身份与性格、人物关系、常驻场景、关键道具和剧情走向。
        </Typography.Paragraph>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          hidden
          onChange={(event) => void handleFileChange(event)}
        />
        <Button
          icon={<UploadOutlined />}
          disabled={loading || saving}
          onClick={() => fileInputRef.current?.click()}
        >
          导入 TXT / MD 总纲
        </Button>
        <Input.TextArea
          className="project-outline-modal__textarea"
          value={outline}
          rows={18}
          maxLength={MAX_OUTLINE_CHARS}
          showCount
          disabled={loading || saving}
          placeholder="粘贴完整总纲：人物档案、关系、性格、常驻场景、关键道具、剧情走向……"
          onChange={(event) => setOutline(event.target.value)}
        />
      </div>
    </Modal>
  )
}

export default ProjectOutlineModal
