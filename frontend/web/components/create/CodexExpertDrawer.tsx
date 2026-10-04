'use client'

import { useMemo, useRef, useState } from 'react'
import { Button, Drawer, Input, Spin, Tag, message } from 'antd'
import {
  CheckCircleOutlined,
  CopyOutlined,
  ExperimentOutlined,
  RobotOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons'
import { useCreationStore } from '~/stores/creation'
import { buildCodexExpertContext } from '~/utils/codexExpertContext'
import {
  fetchCodexExpertStatus,
  submitCodexExpertReview,
  type CodexExpertMode,
  type CodexExpertTask
} from '~/utils/business/codexExpert'
import './CodexExpertDrawer.css'

const MODE_OPTIONS: Array<{
  value: CodexExpertMode
  title: string
  description: string
}> = [
  { value: 'script_audit', title: '剧本体检', description: '逻辑、节奏、人物与集尾钩子' },
  { value: 'asset_integrity', title: '资产完整性', description: '缺失、重复、形态与连续性' },
  { value: 'storyboard', title: '复杂分镜', description: '镜头意图、衔接、时长与可生成性' },
  { value: 'visual_director', title: '视觉导演', description: '统一风格并给图片/视频提示词' }
]

const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED'])

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function errorText(error: unknown): string {
  const candidate = error as {
    response?: { data?: { msg?: string; message?: string } }
    message?: string
  }
  return String(
    candidate?.response?.data?.msg ??
      candidate?.response?.data?.message ??
      candidate?.message ??
      'Codex 专家暂时不可用'
  )
}

async function waitForTask(task: CodexExpertTask): Promise<CodexExpertTask> {
  let current = task
  const startedAt = Date.now()
  while (!TERMINAL_STATUSES.has(String(current.status).toUpperCase())) {
    if (Date.now() - startedAt > 4 * 60_000) {
      throw new Error('专家分析仍在后台进行，请稍后重新打开并再试一次')
    }
    await sleep(1_500)
    current = await fetchCodexExpertStatus(current.taskId)
  }
  return current
}

export interface CodexExpertDrawerProps {
  projectId: number | null
  episodeId: number | null
  routePath: string
}

export function CodexExpertDrawer({ projectId, episodeId, routePath }: CodexExpertDrawerProps) {
  const workTitle = useCreationStore((s) => s.workTitle)
  const formData = useCreationStore((s) => s.formData)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<CodexExpertMode>('script_audit')
  const [question, setQuestion] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState('')
  const [lastTaskId, setLastTaskId] = useState<string | null>(null)
  const runSequence = useRef(0)

  const context = useMemo(
    () => buildCodexExpertContext({ workTitle, projectId, episodeId, routePath, mode, formData }),
    [episodeId, formData, mode, projectId, routePath, workTitle]
  )

  async function runReview() {
    const sequence = ++runSequence.current
    setRunning(true)
    setResult('')
    setLastTaskId(null)
    try {
      const submitted = await submitCodexExpertReview({
        mode,
        context,
        question: question.trim() || undefined,
        projectId,
        episodeId
      })
      setLastTaskId(submitted.taskId)
      const completed = await waitForTask(submitted)
      if (sequence !== runSequence.current) return
      if (String(completed.status).toUpperCase() !== 'SUCCEEDED') {
        throw new Error(completed.userMessage || completed.errorMessage || '本次专家分析失败')
      }
      const text = String(completed.textContent || '').trim()
      if (!text) throw new Error('模型没有返回可展示的分析结果')
      setResult(text)
    } catch (error) {
      if (sequence === runSequence.current) message.error(errorText(error))
    } finally {
      if (sequence === runSequence.current) setRunning(false)
    }
  }

  async function copyResult() {
    if (!result) return
    await navigator.clipboard.writeText(result)
    message.success('专家建议已复制')
  }

  return (
    <>
      <button
        type="button"
        className="codex-expert-fab"
        onClick={() => setOpen(true)}
        aria-label="打开 Codex 专家"
      >
        <RobotOutlined />
        <span>Codex 专家</span>
        <em>测试版</em>
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size={560}
        rootClassName="codex-expert-drawer"
        title={
          <div className="codex-expert-title">
            <span className="codex-expert-title__icon"><RobotOutlined /></span>
            <span>
              <strong>Codex 专家</strong>
              <small>当前项目的只读创作审查工作台</small>
            </span>
          </div>
        }
      >
        <div className="codex-expert-notice">
          <SafetyCertificateOutlined />
          <span>只读取当前页面中的创作文本，不会自动修改项目数据。</span>
          <Tag color="cyan">GPT-5.6</Tag>
        </div>

        <section className="codex-expert-section">
          <div className="codex-expert-section__heading">
            <span>选择专家模式</span>
            <small>一次只解决一种问题，结果会更聚焦</small>
          </div>
          <div className="codex-expert-modes">
            {MODE_OPTIONS.map((item) => (
              <button
                type="button"
                key={item.value}
                className={`codex-expert-mode${mode === item.value ? ' is-active' : ''}`}
                onClick={() => setMode(item.value)}
                disabled={running}
              >
                <span>{item.title}</span>
                <small>{item.description}</small>
                {mode === item.value ? <CheckCircleOutlined /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="codex-expert-section">
          <div className="codex-expert-section__heading">
            <span>补充要求 <i>可选</i></span>
            <small>{context.length.toLocaleString()} 字上下文将自动带入</small>
          </div>
          <Input.TextArea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={2000}
            autoSize={{ minRows: 3, maxRows: 6 }}
            disabled={running}
            placeholder="例如：重点检查第 1 集最后 30 秒是否足够吸引人继续看"
          />
        </section>

        <Button
          type="primary"
          size="large"
          block
          icon={running ? undefined : <ExperimentOutlined />}
          loading={running}
          onClick={() => void runReview()}
          className="codex-expert-run"
        >
          {running ? 'Codex 正在深度分析…' : '开始专家审查'}
        </Button>
        <p className="codex-expert-run-hint">
          {running && lastTaskId ? `任务 #${lastTaskId} 已提交，通常需要几十秒` : '按需调用，不会在后台自动消耗模型额度'}
        </p>

        {running ? (
          <div className="codex-expert-loading">
            <Spin size="large" />
            <strong>正在阅读当前创作上下文</strong>
            <span>复杂分镜或长剧本需要更长时间，请保持页面打开。</span>
          </div>
        ) : null}

        {result ? (
          <section className="codex-expert-result">
            <div className="codex-expert-result__toolbar">
              <span>专家建议</span>
              <Button type="text" icon={<CopyOutlined />} onClick={() => void copyResult()}>
                复制
              </Button>
            </div>
            <div className="codex-expert-result__content">{result}</div>
            <div className="codex-expert-result__footer">
              建议先人工确认，再把需要的修改应用到剧本或分镜。
            </div>
          </section>
        ) : null}
      </Drawer>
    </>
  )
}

export default CodexExpertDrawer
