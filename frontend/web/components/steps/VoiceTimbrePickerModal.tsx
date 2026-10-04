'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, Modal, Select, message } from 'antd'
import { CloseOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import iconStartRaw from '~/assets/img/icon/icon_start.svg'
import { assetUrl } from '~/utils/assetUrl'
import { ShimmerImage } from '~/components/common/ShimmerImage'
import {
  userReferenceAudioDelete,
  userReferenceAudioUpload,
  userRoleVoiceClone,
  userRoleVoiceCloneStatus,
  userVoiceLibraryList
} from '~/utils/businessApi'
import { uploadAudioToOssWithToast } from '~/utils/ossUpload'
import { resolveAudioRelativePath } from './select-asset-image/assetGroups'
import './VoiceTimbrePickerModal.css'

const iconStartUrl = assetUrl(iconStartRaw)

export type VoiceTimbreItem = {
  id: string
  name: string
  gender: string
  ageLabel: string
  accent: string
  avatar: string
  /** 试听地址 */
  previewUrl: string
  /** 音色库记录ID，用于 TTS 接口 voiceLibraryId */
  voiceLibraryId?: number
  /** TTS 模型 ID（aid_ai_model.id） */
  voiceModelId?: number
  /** 厂商侧音色编码 */
  timbreCode?: string
  /** 服务商名称（用于 MiniMax 文本上限等判断） */
  providerName?: string
  modelCode?: string
  referenceAudioId?: number
}

export type VoiceTimbreConfirmPayload = {
  name: string
  avatarUrl: string
  id: string
  previewUrl: string
  voiceLibraryId?: number
  voiceModelId?: number
  timbreCode?: string
  providerName?: string
  modelCode?: string
  referenceAudioId?: number
}

export type VoiceCloneContext = {
  assetId: number
  projectId: number
  episodeId?: number
  defaultName?: string
}

export interface VoiceTimbrePickerModalProps {
  open: boolean
  initialVoiceName?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: VoiceTimbreConfirmPayload) => void
  cloneContext?: VoiceCloneContext
}

const GENDER_MAP: Record<string, string> = { female: '女性', male: '男性', neutral: '中性' }
const AGE_MAP: Record<string, string> = {
  child: '儿童',
  teen: '少年',
  young: '青年',
  adult: '成年',
  middle: '中年',
  elderly: '老年'
}

function popupContainer(triggerNode: HTMLElement) {
  return (triggerNode?.closest?.('.ant-modal-content') as HTMLElement) || document.body
}

export function VoiceTimbrePickerModal({
  open,
  initialVoiceName,
  onOpenChange,
  onConfirm,
  cloneContext
}: VoiceTimbrePickerModalProps) {
  /** 从接口加载的音色列表 */
  const [allVoices, setAllVoices] = useState<VoiceTimbreItem[]>([])
  const [, setLoading] = useState(false)

  /** 使用 null + 打开时 key 递增，确保仅显示占位符「姓名/年龄/口音」 */
  const [filterName, setFilterName] = useState<string | null>(null)
  const [filterAge, setFilterAge] = useState<string | null>(null)
  const [filterAccent, setFilterAccent] = useState<string | null>(null)
  const [filterResetKey, setFilterResetKey] = useState(0)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneBusy, setCloneBusy] = useState(false)
  const [cloneFile, setCloneFile] = useState<File | null>(null)
  const [cloneName, setCloneName] = useState('')
  const [cloneText, setCloneText] = useState('')
  const [cloneGender, setCloneGender] = useState('neutral')
  const [cloneAge, setCloneAge] = useState('adult')
  const [cloneRights, setCloneRights] = useState(false)
  const [playingId, setPlayingIdState] = useState<string | null>(null)
  const playingIdRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function setPlayingId(v: string | null) {
    playingIdRef.current = v
    setPlayingIdState(v)
  }

  async function loadVoices(): Promise<VoiceTimbreItem[]> {
    setLoading(true)
    try {
      const res = await userVoiceLibraryList({ pageNum: 1, pageSize: 100 })
      const voices = res.data.map((item: any) => ({
        id: String(item.id),
        name: item.voiceName || '未命名',
        gender: GENDER_MAP[item.gender] || item.gender || '未知',
        ageLabel: AGE_MAP[item.ageRange] || item.ageRange || '未知',
        accent:
          item.language === 'zh-CN'
            ? '普通话'
            : item.language === 'en-US'
              ? '英语'
              : item.language === 'ja-JP'
                ? '日语'
                : item.language || '普通话',
        avatar: item.avatarUrl || `https://api.dicebear.com/7.x/avataaars/png?seed=${item.id}`,
        previewUrl: item.sampleUrl || '',
        voiceLibraryId: Number(item.id),
        voiceModelId: Number(item.modelId) > 0 ? Number(item.modelId) : undefined,
        timbreCode: String(item.voiceCode || '').trim() || undefined,
        providerName: String(item.providerName || item.provider || '').trim() || undefined,
        modelCode: String(item.modelCode || '').trim() || undefined
      }))
      setAllVoices(voices)
      return voices
    } catch {
      // 接口失败时列表为空
      return []
    } finally {
      setLoading(false)
    }
  }

  const nameOptions = [...new Set(allVoices.map((x) => x.name))].map((n) => ({
    value: n,
    label: n
  }))
  const ageOptions = [...new Set(allVoices.map((x) => x.ageLabel))].map((a) => ({
    value: a,
    label: a
  }))
  const accentOptions = [...new Set(allVoices.map((x) => x.accent))].map((x) => ({
    value: x,
    label: x
  }))

  const filteredVoices = allVoices.filter((v) => {
    if (filterName && v.name !== filterName) return false
    if (filterAge && v.ageLabel !== filterAge) return false
    if (filterAccent && v.accent !== filterAccent) return false
    return true
  })

  function stopAudio() {
    const a = audioRef.current
    if (a) {
      a.pause()
      a.src = ''
    }
    setPlayingId(null)
  }

  function confirmVoice(v: VoiceTimbreItem) {
    stopAudio()
    onConfirm({
      name: v.name,
      avatarUrl: v.avatar,
      id: v.id,
      previewUrl: v.previewUrl,
      voiceLibraryId: v.voiceLibraryId,
      voiceModelId: v.voiceModelId,
      timbreCode: v.timbreCode,
      providerName: v.providerName,
      modelCode: v.modelCode,
      referenceAudioId: v.referenceAudioId
    })
    onOpenChange(false)
  }

  function onAvatarClick(v: VoiceTimbreItem) {
    const a = audioRef.current
    if (!a) return
    if (playingIdRef.current === v.id) {
      a.pause()
      setPlayingId(null)
      return
    }
    stopAudio()
    setPlayingId(v.id)
    a.src = v.previewUrl
    a.play().catch(() => {
      message.warning('试听加载失败，请检查网络或替换为有效试听地址')
      setPlayingId(null)
    })
  }

  function onAudioEnded() {
    setPlayingId(null)
  }

  function onAudioPause() {
    if (audioRef.current && audioRef.current.ended) return
  }

  useEffect(() => {
    if (open) {
      setFilterResetKey((k) => k + 1)
      setFilterName(null)
      setFilterAge(null)
      setFilterAccent(null)
      setCloneOpen(false)
      setCloneBusy(false)
      setCloneFile(null)
      setCloneName(cloneContext?.defaultName || '')
      setCloneText('')
      setCloneGender('neutral')
      setCloneAge('adult')
      setCloneRights(false)
      stopAudio()
      // 加载音色列表
      loadVoices().then((voices) => {
        const name = initialVoiceName?.trim()
        const found = name ? voices.find((x) => x.name === name) : null
        setSelectedId(found?.id ?? voices[0]?.id ?? null)
      })
    } else {
      stopAudio()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onCancel() {
    stopAudio()
    onOpenChange(false)
  }

  function chooseCloneFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.wav,.mp3,audio/wav,audio/mpeg'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      if (file.size > 7.5 * 1024 * 1024) {
        message.warning('克隆样本不能超过 7.5MB')
        return
      }
      setCloneFile(file)
      if (!cloneName.trim()) setCloneName(file.name.replace(/\.[^/.]+$/, ''))
    }
    input.click()
  }

  async function submitClone() {
    if (!cloneContext?.assetId || !cloneContext.projectId) {
      message.error('请先保存角色资产')
      return
    }
    if (!cloneFile) {
      message.warning('请上传 1-60 秒的 WAV 或 MP3 样本')
      return
    }
    if (!cloneName.trim()) {
      message.warning('请填写音色名称')
      return
    }
    if (!cloneRights) {
      message.warning('请确认已获得声音使用授权')
      return
    }
    setCloneBusy(true)
    let referenceAudioId: number | null = null
    try {
      const cloneStatus = await userRoleVoiceCloneStatus()
      if (!cloneStatus.enabled) throw new Error(cloneStatus.message || '音色克隆服务未启用')
      const ossUrl = await uploadAudioToOssWithToast(cloneFile)
      if (!ossUrl) return
      const uploadBody: Parameters<typeof userReferenceAudioUpload>[0] = {
        projectId: cloneContext.projectId,
        audioName: cloneName.trim(),
        audioUrl: resolveAudioRelativePath(ossUrl)
      }
      if (cloneContext.episodeId && cloneContext.episodeId > 0) {
        uploadBody.episodeId = cloneContext.episodeId
      }
      const sample = await userReferenceAudioUpload(uploadBody)
      referenceAudioId = Number(sample.id)
      const binding = await userRoleVoiceClone({
        assetId: cloneContext.assetId,
        referenceAudioId,
        voiceName: cloneName.trim(),
        sampleText: cloneText.trim() || undefined,
        language: 'zh-CN',
        gender: cloneGender,
        ageRange: cloneAge,
        rightsConfirmed: true
      })
      const voiceId = Number(binding.voiceLibraryId)
      if (!Number.isFinite(voiceId) || voiceId <= 0) throw new Error('克隆音色未返回有效 ID')
      message.success('克隆音色已生成并绑定角色')
      confirmVoice({
        id: String(voiceId),
        name: String(binding.voiceName || cloneName.trim()),
        gender: GENDER_MAP[String(binding.gender || cloneGender)] || '中性',
        ageLabel: AGE_MAP[String(binding.ageRange || cloneAge)] || '成年',
        accent: '普通话',
        avatar: String(binding.avatarUrl || `https://api.dicebear.com/7.x/avataaars/png?seed=${voiceId}`),
        previewUrl: String(binding.sampleUrl || sample.audioUrl || ossUrl),
        voiceLibraryId: voiceId,
        referenceAudioId
      })
    } catch (e: unknown) {
      if (referenceAudioId) {
        try { await userReferenceAudioDelete({ id: referenceAudioId }) } catch { /* keep original error */ }
      }
      const err = e as { msg?: string; message?: string }
      message.error(err?.msg || err?.message || '克隆音色失败')
    } finally {
      setCloneBusy(false)
    }
  }

  useEffect(() => {
    return () => stopAudio()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal
      open={open}
      width={860}
      footer={null}
      destroyOnHidden
      wrapClassName="create-flow-modal voice-timbre-picker-wrap"
      className="voice-timbre-picker-modal"
      centered
      onCancel={onCancel}
      closeIcon={<CloseOutlined className="voice-picker-close" />}
    >
      <div className="voice-picker-shell">
        <div className="voice-picker-heading">
          <h2 className="voice-picker-title">配音角色</h2>
          {cloneContext ? (
            <Button
              className="voice-clone-open-btn"
              icon={<PlusOutlined />}
              onClick={() => setCloneOpen((value) => !value)}
            >
              克隆新音色
            </Button>
          ) : null}
        </div>

        {cloneContext && cloneOpen ? (
          <div className="voice-clone-panel">
            <div className="voice-clone-row">
              <Input
                value={cloneName}
                maxLength={100}
                placeholder="音色名称"
                onChange={(event) => setCloneName(event.target.value)}
              />
              <Select
                value={cloneGender}
                onChange={setCloneGender}
                options={[
                  { value: 'female', label: '女性' },
                  { value: 'male', label: '男性' },
                  { value: 'neutral', label: '中性' }
                ]}
              />
              <Select
                value={cloneAge}
                onChange={setCloneAge}
                options={Object.entries(AGE_MAP).map(([value, label]) => ({ value, label }))}
              />
            </div>
            <Input
              value={cloneText}
              maxLength={500}
              placeholder="样本中朗读的文字（可选，用于记录）"
              onChange={(event) => setCloneText(event.target.value)}
            />
            <div className="voice-clone-actions">
              <Button icon={<UploadOutlined />} onClick={chooseCloneFile}>
                {cloneFile?.name || '上传 WAV / MP3（1-60 秒）'}
              </Button>
              <Checkbox checked={cloneRights} onChange={(event) => setCloneRights(event.target.checked)}>
                我已获得该声音的使用和克隆授权
              </Checkbox>
              <Button type="primary" loading={cloneBusy} onClick={() => void submitClone()}>
                生成并绑定
              </Button>
            </div>
          </div>
        ) : null}

        <div className="voice-picker-filters">
          <Select
            key={`fn-${filterResetKey}`}
            value={filterName}
            onChange={(v) => setFilterName(v ?? null)}
            className="voice-picker-select"
            allowClear
            options={nameOptions}
            placeholder="姓名"
            classNames={{ popup: { root: 'voice-picker-select-popup' } }}
            getPopupContainer={popupContainer}
          />
          <Select
            key={`fa-${filterResetKey}`}
            value={filterAge}
            onChange={(v) => setFilterAge(v ?? null)}
            className="voice-picker-select"
            allowClear
            options={ageOptions}
            placeholder="年龄"
            classNames={{ popup: { root: 'voice-picker-select-popup' } }}
            getPopupContainer={popupContainer}
          />
          <Select
            key={`fac-${filterResetKey}`}
            value={filterAccent}
            onChange={(v) => setFilterAccent(v ?? null)}
            className="voice-picker-select"
            allowClear
            options={accentOptions}
            placeholder="口音"
            classNames={{ popup: { root: 'voice-picker-select-popup' } }}
            getPopupContainer={popupContainer}
          />
        </div>

        <div className="voice-picker-list">
          {filteredVoices.map((v) => (
            <div
              key={v.id}
              className={`voice-card${selectedId === v.id ? ' is-selected' : ''}`}
            >
              <div
                className={`voice-card-avatar-wrap${playingId === v.id ? ' is-audio-playing' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onAvatarClick(v)
                }}
              >
                <ShimmerImage
                  src={v.avatar}
                  alt={v.name}
                  imgClass="voice-card-avatar"
                  wrapperClass="voice-card-avatar-shimmer"
                  objectFit="cover"
                  revealDirection="fade"
                  minShimmerMs={280}
                />
                <div className="voice-card-avatar-mask" />
                {playingId === v.id ? (
                  <div className="voice-card-play-inner voice-card-pause">
                    <span className="voice-card-eq" aria-hidden="true">
                      <span className="eq-bar eq-bar-1" />
                      <span className="eq-bar eq-bar-2" />
                      <span className="eq-bar eq-bar-3" />
                    </span>
                  </div>
                ) : (
                  <div className="voice-card-play-inner">
                    <img
                      className="voice-card-play-icon"
                      src={iconStartUrl}
                      alt="试听"
                      width={24}
                      height={24}
                    />
                  </div>
                )}
              </div>
              <div className="voice-card-text">
                <div className="voice-card-name">{v.name}</div>
                <div className="voice-card-tags">
                  {v.gender}/{v.ageLabel}
                </div>
              </div>
              <button
                type="button"
                className={`voice-card-select-btn${selectedId === v.id ? ' is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  confirmVoice(v)
                }}
              >
                选择TA
              </button>
            </div>
          ))}
        </div>
      </div>

      <audio ref={audioRef} className="voice-picker-audio" onEnded={onAudioEnded} onPause={onAudioPause} />
    </Modal>
  )
}

export default VoiceTimbrePickerModal
