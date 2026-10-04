'use client'

import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Modal, Segmented, Spin, Tag, message } from 'antd'
import type {
  StoryboardScriptReviewApplyItem,
  StoryboardScriptReviewData,
  StoryboardScriptReviewItem
} from '~/types/business-api'
import {
  userStoryboardApplyScriptReview,
  userStoryboardGetScriptReview
} from '~/utils/businessApi'
import {
  changedStoryboardFields,
  diffStoryboardText
} from '~/utils/storyboardScriptReviewDiff'
import './storyboard-script-review-modal.css'

type Decision = 'ORIGINAL' | 'SUGGESTION' | 'MANUAL'

interface ReviewRow {
  key: string
  original: StoryboardScriptReviewItem | null
  suggestion: StoryboardScriptReviewItem | null
  decision: Decision
  manual: {
    title: string
    storyScript: string
    dialogueText: string
  }
}

export function StoryboardScriptReviewModal(props: {
  open: boolean
  taskId: number | null
  onApplied: () => void | Promise<void>
}) {
  const { open, taskId, onApplied } = props
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [review, setReview] = useState<StoryboardScriptReviewData | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])

  useEffect(() => {
    if (!open || !taskId) return
    let alive = true
    setLoading(true)
    userStoryboardGetScriptReview(taskId)
      .then((data) => {
        if (!alive) return
        setReview(data)
        const count = Math.max(data.originals.length, data.suggestions.length)
        setRows(Array.from({ length: count }, (_, index) => {
          const original = data.originals[index] ?? null
          const suggestion = data.suggestions[index] ?? null
          // 手动编辑默认从原分镜起稿，避免用户已写内容再次被 AI 候选覆盖。
          const base = original ?? suggestion
          return {
            key: `${original?.storyboardId ?? 'none'}-${suggestion?.storyboardId ?? 'none'}`,
            original,
            suggestion,
            decision: suggestion ? 'SUGGESTION' : 'ORIGINAL',
            manual: {
              title: String(base?.title ?? ''),
              storyScript: String(base?.storyScript ?? ''),
              dialogueText: String(base?.dialogueText ?? '')
            }
          }
        }))
      })
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : '审核数据加载失败'
        message.error(text)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, taskId])

  const changedCount = useMemo(
    () => rows.filter((row) => changedStoryboardFields(row.original, row.suggestion)[0] !== '格式整理').length,
    [rows]
  )

  const patchRow = (index: number, patch: Partial<ReviewRow>) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  }

  const chooseAll = (kind: 'ORIGINAL' | 'SUGGESTION') => {
    setRows((current) => current.map((row) => ({
      ...row,
      decision: kind === 'SUGGESTION'
        ? row.suggestion ? 'SUGGESTION' : 'ORIGINAL'
        : row.original ? 'ORIGINAL' : 'SUGGESTION'
    })))
  }

  const submit = async () => {
    if (!taskId || rows.length === 0) return
    const items: StoryboardScriptReviewApplyItem[] = rows.map((row) => {
      const selected = row.decision === 'ORIGINAL'
        ? row.original
        : row.decision === 'MANUAL'
          ? row.original ?? row.suggestion
          : row.suggestion ?? row.original
      if (!selected) throw new Error('存在无法保存的空分镜')
      return row.decision === 'MANUAL'
        ? {
            decision: 'MANUAL',
            storyboardId: selected.storyboardId,
            title: row.manual.title,
            storyScript: row.manual.storyScript,
            dialogueText: row.manual.dialogueText
          }
        : { decision: row.decision, storyboardId: selected.storyboardId }
    })
    setSubmitting(true)
    try {
      await userStoryboardApplyScriptReview({ taskId, items })
      await onApplied()
      message.success('分镜审核结果已保存，未采用版本已归档保留')
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '审核结果保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      className="storyboard-script-review-modal"
      open={open}
      title="审核 AI 分镜建议"
      width="min(1180px, 94vw)"
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={[
        <Button key="keep" onClick={() => chooseAll('ORIGINAL')}>全部保留原分镜</Button>,
        <Button key="accept" onClick={() => chooseAll('SUGGESTION')}>批量接受 AI 建议</Button>,
        <Button key="save" type="primary" loading={submitting} onClick={() => void submit()}>
          保存审核结果
        </Button>
      ]}
    >
      <Alert
        type="info"
        showIcon
        message={`原分镜不会被删除。共 ${rows.length} 组对照，${changedCount} 组存在内容调整；可逐条选择或手动修改。`}
      />
      {review?.applied ? (
        <Alert className="storyboard-review-applied" type="warning" showIcon message="该任务已有审核记录，再次保存将更新最终采用版本。" />
      ) : null}
      <Spin spinning={loading}>
        <div className="storyboard-review-list">
          {rows.map((row, index) => (
            <ReviewCard
              key={row.key}
              index={index}
              row={row}
              onDecision={(decision) => patchRow(index, { decision })}
              onManualChange={(manual) => patchRow(index, { manual })}
            />
          ))}
        </div>
      </Spin>
    </Modal>
  )
}

function ReviewCard(props: {
  index: number
  row: ReviewRow
  onDecision: (decision: Decision) => void
  onManualChange: (manual: ReviewRow['manual']) => void
}) {
  const { index, row, onDecision, onManualChange } = props
  const fields = changedStoryboardFields(row.original, row.suggestion)
  const reason = row.suggestion?.reason ?? row.original?.reason ?? '根据镜头可执行性整理内容。'
  const options = [
    ...(row.original ? [{ label: '保留原分镜', value: 'ORIGINAL' as const }] : []),
    ...(row.suggestion ? [{ label: '接受 AI 建议', value: 'SUGGESTION' as const }] : []),
    { label: '基于原分镜手动修改', value: 'MANUAL' as const }
  ]
  return (
    <section className="storyboard-review-card">
      <header>
        <strong>对照 {String(index + 1).padStart(2, '0')}</strong>
        <div>{fields.map((field) => <Tag key={field} color={field === '格式整理' ? 'default' : 'cyan'}>{field}</Tag>)}</div>
      </header>
      <div className="storyboard-review-reason"><b>修改建议说明：</b>{reason}</div>
      <div className="storyboard-review-columns">
        <VersionColumn label="原分镜" item={row.original} other={row.suggestion} side="before" selected={row.decision === 'ORIGINAL'} />
        <VersionColumn label="AI 新分镜" item={row.suggestion} other={row.original} side="after" selected={row.decision === 'SUGGESTION'} />
      </div>
      <Segmented block options={options} value={row.decision} onChange={(value) => onDecision(value as Decision)} />
      {row.decision === 'MANUAL' ? (
        <div className="storyboard-review-manual">
          <Input value={row.manual.title} placeholder="分镜标题" onChange={(event) => onManualChange({ ...row.manual, title: event.target.value })} />
          <Input.TextArea value={row.manual.storyScript} autoSize={{ minRows: 5, maxRows: 14 }} placeholder="分镜内容" onChange={(event) => onManualChange({ ...row.manual, storyScript: event.target.value })} />
          <Input.TextArea value={row.manual.dialogueText} autoSize={{ minRows: 2, maxRows: 8 }} placeholder="台词（可留空）" onChange={(event) => onManualChange({ ...row.manual, dialogueText: event.target.value })} />
        </div>
      ) : null}
    </section>
  )
}

function VersionColumn(props: {
  label: string
  item: StoryboardScriptReviewItem | null
  other: StoryboardScriptReviewItem | null
  side: 'before' | 'after'
  selected: boolean
}) {
  const { label, item, other, side, selected } = props
  if (!item) return <div className="storyboard-review-version is-empty"><b>{label}</b><p>此版本没有对应镜头</p></div>
  return (
    <div className={`storyboard-review-version${selected ? ' is-selected' : ''}`}>
      <b>{label}</b>
      <ReviewField label="标题" value={item.title} otherValue={other?.title} side={side} />
      <ReviewField label="分镜内容" value={item.storyScript} otherValue={other?.storyScript} side={side} multiline />
      <ReviewField label="台词" value={item.dialogueText} otherValue={other?.dialogueText} side={side} multiline />
    </div>
  )
}

function ReviewField(props: {
  label: string
  value?: string | null
  otherValue?: string | null
  side: 'before' | 'after'
  multiline?: boolean
}) {
  const diff = props.side === 'before'
    ? diffStoryboardText(props.value, props.otherValue)
    : diffStoryboardText(props.otherValue, props.value)
  const prefix = props.side === 'before' ? diff.beforePrefix : diff.afterPrefix
  const changed = props.side === 'before' ? diff.beforeChanged : diff.afterChanged
  const suffix = props.side === 'before' ? diff.beforeSuffix : diff.afterSuffix
  return (
    <div className={`storyboard-review-field${props.multiline ? ' is-multiline' : ''}`}>
      <span className="storyboard-review-field-label">{props.label}</span>
      <p>{prefix}{changed ? <mark>{changed}</mark> : null}{suffix || (!prefix && !changed ? '—' : '')}</p>
    </div>
  )
}
