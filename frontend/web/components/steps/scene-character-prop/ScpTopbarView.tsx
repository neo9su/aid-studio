'use client'

import { useRef, useState } from 'react'
import { Alert, Button, Dropdown, Modal, Tooltip, message } from 'antd'
import {
  BookOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  IdcardOutlined,
  LoadingOutlined,
  PictureOutlined,
  ThunderboltOutlined,
  UploadOutlined
} from '@ant-design/icons'
import { ProjectOutlineModal } from './ProjectOutlineModal'
import {
  sortUserAssetRpsRows,
  userAssetRpsFormCreate,
  userAssetRpsFormImageCreate,
  userAssetRpsFormUse,
  userAssetRpsList,
  userProjectDetail
} from '~/utils/businessApi'
import { assetUrl } from '~/utils/assetUrl'
import { uploadImagesToOssWithToast } from '~/utils/ossUpload'
import { resolveStoryScriptSaveContext } from '~/utils/storyScriptSaveContext'
import iconAddSceneRaw from '~/assets/img/icon/extract.svg'
import iconAddSceneSelRaw from '~/assets/img/icon/extract-sel.svg'
import iconAddCharacterRaw from '~/assets/img/icon/character.svg'
import iconAddPropSelRaw from '~/assets/img/icon/character-sel.svg'
import iconAddPropRaw from '~/assets/img/icon/prop.svg'
import iconAddCharacterSelRaw from '~/assets/img/icon/prop-sel.svg'
import { tabs } from './useScpDerived'
import {
  buildCharacterExportDocument,
  downloadCharacterExportDocument,
  matchCharacterImageFilesByRows,
  type CharacterExportFormat,
  type CharacterImageImportMatch
} from './characterBatchTransfer'
import { getFormName, resolveCreatedFormImageId } from './scpRowUtils'
import type { ScpCtx } from './types'

const iconAddScene = assetUrl(iconAddSceneRaw)
const iconAddSceneSel = assetUrl(iconAddSceneSelRaw)
const iconAddCharacter = assetUrl(iconAddCharacterRaw)
const iconAddPropSel = assetUrl(iconAddPropSelRaw)
const iconAddProp = assetUrl(iconAddPropRaw)
const iconAddCharacterSel = assetUrl(iconAddCharacterSelRaw)

/** 顶部切换：场景 / 角色 / 道具 + 顶栏「添加」与「批量操作」 */
export function ScpTopbarView({ ctx }: { ctx: ScpCtx }) {
  const [outlineModalOpen, setOutlineModalOpen] = useState(false)
  const [extractAfterOutlineSave, setExtractAfterOutlineSave] = useState(false)
  const [photoMatches, setPhotoMatches] = useState<CharacterImageImportMatch[]>([])
  const [photoImportOpen, setPhotoImportOpen] = useState(false)
  const [photoImporting, setPhotoImporting] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const isExtracting = ctx.isExtracting()
  const localValue = ctx.localValue.value
  const activeTab = ctx.activeTab.value

  /** 顶栏「添加场景/角色/道具」：默认图标 */
  const topbarAddIconNor =
    activeTab === 'scene' ? iconAddScene : activeTab === 'character' ? iconAddCharacter : iconAddProp

  /** 顶栏「添加」：悬停且可点时展示选中态图标 */
  const topbarAddIconSel =
    activeTab === 'scene'
      ? iconAddSceneSel
      : activeTab === 'character'
        ? iconAddCharacterSel
        : iconAddPropSel

  const projectIdRaw = Number(ctx.store().currentProjectId)
  const projectId = Number.isFinite(projectIdRaw) && projectIdRaw > 0 ? projectIdRaw : null

  const handleOutlineExtract = async () => {
    if (!projectId) {
      message.warning('请先选择作品')
      return
    }
    try {
      const project = await userProjectDetail(projectId)
      if (!String(project.projectOutline || '').trim()) {
        message.info('请先填写并保存项目总纲')
        setExtractAfterOutlineSave(true)
        setOutlineModalOpen(true)
        return
      }
      ctx.emitOpenExtractModal('all', 'PROJECT_OUTLINE')
    } catch (error: unknown) {
      const err = error as { msg?: string; message?: string }
      message.error(err?.msg || err?.message || '读取项目总纲失败')
    }
  }

  const handleExportCharacters = async (format: CharacterExportFormat) => {
    ctx.batchOpsDropdownOpen.set(false)
    const saveContext = await resolveStoryScriptSaveContext(ctx.store(), ctx.route())
    if (!saveContext) {
      message.warning('请先选择作品和剧集')
      return
    }
    const close = message.loading('正在整理角色描述与提示词…', 0)
    try {
      const { rows } = await userAssetRpsList({
        projectId: saveContext.projectId,
        episodeId: saveContext.episodeId,
        assetType: 'character'
      })
      const sortedRows = sortUserAssetRpsRows(rows)
      if (!sortedRows.length) {
        message.info('当前没有可导出的角色资产')
        return
      }
      const project = await userProjectDetail(saveContext.projectId)
      const document = buildCharacterExportDocument(
        sortedRows,
        String(project.projectOutline || ''),
        format
      )
      downloadCharacterExportDocument(document, saveContext.projectId, format)
      message.success(`已导出 ${sortedRows.length} 个角色的 ${format.toUpperCase()} 生图任务书`)
    } catch (error: unknown) {
      const err = error as { msg?: string; message?: string }
      message.error(err?.msg || err?.message || '角色资料导出失败')
    } finally {
      close()
    }
  }

  const handleChooseCharacterPhotos = () => {
    ctx.batchOpsDropdownOpen.set(false)
    window.setTimeout(() => photoInputRef.current?.click(), 0)
  }

  const handleCharacterPhotoFiles = async (files: File[]) => {
    const images = files.filter(
      (file) => file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
    )
    if (!images.length) {
      message.warning('请选择图片文件')
      return
    }
    const saveContext = await resolveStoryScriptSaveContext(ctx.store(), ctx.route())
    if (!saveContext) {
      message.warning('请先选择作品和剧集')
      return
    }
    try {
      const { rows } = await userAssetRpsList({
        projectId: saveContext.projectId,
        episodeId: saveContext.episodeId,
        assetType: 'character'
      })
      const matches = matchCharacterImageFilesByRows(images, sortUserAssetRpsRows(rows))
      setPhotoMatches(matches)
      setPhotoImportOpen(true)
    } catch (error: unknown) {
      const err = error as { msg?: string; message?: string }
      message.error(err?.msg || err?.message || '读取角色资产失败')
    }
  }

  const handleBatchPhotoImport = async () => {
    const matched = photoMatches.filter(
      (item): item is CharacterImageImportMatch & { target: NonNullable<CharacterImageImportMatch['target']> } =>
        item.status === 'matched' && item.target != null
    )
    if (!matched.length) return
    setPhotoImporting(true)
    try {
      const urls = await uploadImagesToOssWithToast(matched.map((item) => item.file))
      if (!urls || urls.length !== matched.length) {
        message.error('图片上传结果不完整，请重新选择后再试')
        return
      }
      const saveContext = await resolveStoryScriptSaveContext(ctx.store(), ctx.route())
      if (!saveContext) {
        message.warning('请先选择作品和剧集')
        return
      }
      let successCount = 0
      const failedNames: string[] = []
      const createdFormIds = new Map<string, number>()
      for (let index = 0; index < matched.length; index += 1) {
        const item = matched[index]
        try {
          const target = item.target
          const formKey = `${target.assetId}:${target.desiredFormName.normalize('NFKC').toLowerCase()}`
          let formId = target.formId ?? createdFormIds.get(formKey)
          if (formId == null) {
            const updated = await userAssetRpsFormCreate({
              projectId: saveContext.projectId,
              episodeId: saveContext.episodeId,
              assetId: Number(target.assetId),
              imageUrl: '',
              name: target.desiredFormName,
              sourceType: 'upload'
            })
            const wanted = target.desiredFormName.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
            const created = (updated.forms ?? []).find((form) =>
              getFormName(String(form.name || '')).normalize('NFKC').replace(/\s+/g, '').toLowerCase() === wanted
            ) ?? (updated.forms ?? []).at(-1)
            formId = created?.id != null ? Number(created.id) : undefined
            if (formId == null) throw new Error('自动创建角色形态后未返回形态 ID')
            createdFormIds.set(formKey, formId)
          }
          const hasPreferredImageForSameForm = matched.some((candidate) =>
            candidate !== item &&
            candidate.status === 'matched' &&
            candidate.target?.assetId === target.assetId &&
            candidate.target?.desiredFormName === target.desiredFormName &&
            candidate.target?.makePrimary
          )
          const shouldUse = target.makePrimary || !hasPreferredImageForSameForm
          const createdImage = await userAssetRpsFormImageCreate({
            formId,
            imageUrl: urls[index],
            name: item.file.name.replace(/\.[^.]+$/, ''),
            sourceType: 'upload'
          })
          const createdImageId = resolveCreatedFormImageId(createdImage)
          if (createdImageId == null) {
            throw new Error('图片已上传，但绑定接口未返回图片 ID')
          }
          if (shouldUse) {
            await userAssetRpsFormUse({ projectId: saveContext.projectId, imageId: createdImageId })
          }
          successCount += 1
        } catch (error) {
          console.error('批量导入角色形态图失败', item.file.name, error)
          failedNames.push(item.file.name)
        }
      }
      await ctx.loadPersonalAssetsForTab('character', { background: true })
      if (failedNames.length) {
        message.warning(`已导入 ${successCount} 张，${failedNames.length} 张绑定失败：${failedNames.join('、')}`)
      } else {
        message.success(`已自动归类并绑定 ${successCount} 张角色形态图`)
        setPhotoImportOpen(false)
        setPhotoMatches([])
      }
    } finally {
      setPhotoImporting(false)
    }
  }

  const matchedCount = photoMatches.filter((item) => item.status === 'matched').length
  const issueCount = photoMatches.length - matchedCount

  return (
    <>
    <div className="scp-topbar">
      <div className="scp-tabs" role="tablist" aria-label="素材准备切换">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`scp-tab${activeTab === t.key ? ' active' : ''}${isExtracting ? ' disabled' : ''}`}
            disabled={isExtracting}
            onClick={() => {
              if (!isExtracting) ctx.activeTab.set(t.key)
            }}
          >
            <span className="scp-tab-label">{t.label}</span>
            {ctx.isTabLoading(t.key) ? <LoadingOutlined className="scp-tab-loading" spin /> : null}
          </button>
        ))}
      </div>
      {!isExtracting &&
      ((activeTab === 'scene' && localValue.scenes.length > 0) ||
        (activeTab === 'character' && localValue.characters.length > 0) ||
        (activeTab === 'prop' && localValue.props.length > 0)) ? (
        <p className="scp-topbar-hint">
          {activeTab === 'scene' ? (
            <>(已识别 {localValue.scenes.length} 个场景，可选择生成新场景图或导入已有图片)</>
          ) : activeTab === 'character' ? (
            <>(已识别 {localValue.characters.length} 个角色，可选择生成新角色图或导入已有图片)</>
          ) : (
            <>(已识别 {localValue.props.length} 个道具，可选择生成新道具图或导入已有图片)</>
          )}
        </p>
      ) : null}
      <div className="scp-topbar__right">
        {!isExtracting ? (
          <Button
            className="scp-topbar-extract-btn"
            icon={<BookOutlined />}
            onClick={() => {
              setExtractAfterOutlineSave(false)
              setOutlineModalOpen(true)
            }}
          >
            项目总纲
          </Button>
        ) : null}
        {!isExtracting ? (
          <Tooltip title="从独立项目总纲初始化角色、场景和关键道具；后续分集只需增量提取">
            <Button
              className="scp-topbar-extract-btn"
              icon={<ThunderboltOutlined />}
              onClick={() => void handleOutlineExtract()}
            >
              总纲初始化资产
            </Button>
          </Tooltip>
        ) : null}
        {!isExtracting &&
        ((activeTab === 'scene' && localValue.scenes.length > 0) ||
          (activeTab === 'character' && localValue.characters.length > 0) ||
          (activeTab === 'prop' && localValue.props.length > 0)) ? (
          <Button
            className="scp-topbar-extract-btn"
            icon={<ThunderboltOutlined />}
            onClick={() => ctx.handleAutoExtract(activeTab)}
          >
            {activeTab === 'character'
              ? '更新角色资产'
              : `继续提取${activeTab === 'scene' ? '场景' : '道具'}`}
          </Button>
        ) : null}
        <Button
          className="scp-topbar-add-btn"
          disabled={ctx.topbarAddDisabled()}
          loading={ctx.manualAssetAdding.value}
          onClick={ctx.handleEmptyAssetAddClick}
          icon={
            <span className="scp-topbar-add-btn__ico-wrap">
              <img
                src={topbarAddIconNor}
                alt=""
                className="scp-topbar-add-btn__ico scp-topbar-add-btn__ico--nor"
              />
              <img
                src={topbarAddIconSel}
                alt=""
                className="scp-topbar-add-btn__ico scp-topbar-add-btn__ico--sel"
              />
            </span>
          }
        >
          {ctx.emptyAssetAddLabel()}
        </Button>
        {!isExtracting && ctx.showBatchGenerateTopbarBtn() ? (
          <Dropdown
            open={ctx.batchOpsDropdownOpen.value}
            onOpenChange={(v) => ctx.batchOpsDropdownOpen.set(v)}
            trigger={['click']}
            placement="bottomRight"
            classNames={{ root: 'scp-topbar-ops-dropdown-overlay' }}
            popupRender={() => (
              <div className="scp-topbar-ops-panel" role="menu" aria-label="批量操作">
                <div className="scp-topbar-ops-panel__list">
                  {ctx.batchFormGenerateMenuDisabled() && ctx.batchFormGenerateDisabledTooltip() ? (
                    <Tooltip
                      title={ctx.batchFormGenerateDisabledTooltip()}
                      placement="left"
                      mouseEnterDelay={0.2}
                    >
                      <span className="scp-topbar-ops-panel__item-wrap">
                        <button
                          type="button"
                          className="scp-topbar-ops-panel__item scp-topbar-ops-panel__item--disabled"
                          disabled
                          role="menuitem"
                        >
                          <ThunderboltOutlined />
                          <span>{ctx.batchFormGenerateMenuLabel()}</span>
                        </button>
                      </span>
                    </Tooltip>
                  ) : (
                    <button
                      type="button"
                      className="scp-topbar-ops-panel__item"
                      role="menuitem"
                      onClick={ctx.handleBatchFormGenerateClick}
                    >
                      <ThunderboltOutlined />
                      <span>{ctx.batchFormGenerateMenuLabel()}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="scp-topbar-ops-panel__item"
                    role="menuitem"
                    disabled={ctx.batchImageGenerateMenuDisabled()}
                    onClick={ctx.handleBatchImageGenerateClick}
                  >
                    <PictureOutlined />
                    <span>{ctx.batchImageGenerateMenuLabel()}</span>
                  </button>
                  {activeTab === 'character' ? (
                    <>
                      <button
                        type="button"
                        className="scp-topbar-ops-panel__item"
                        role="menuitem"
                        onClick={() => void handleExportCharacters('md')}
                      >
                        <DownloadOutlined />
                        <span>导出角色生图任务书（MD）</span>
                      </button>
                      <button
                        type="button"
                        className="scp-topbar-ops-panel__item"
                        role="menuitem"
                        onClick={() => void handleExportCharacters('txt')}
                      >
                        <DownloadOutlined />
                        <span>导出角色生图任务书（TXT）</span>
                      </button>
                      <button
                        type="button"
                        className="scp-topbar-ops-panel__item"
                        role="menuitem"
                        onClick={handleChooseCharacterPhotos}
                      >
                        <UploadOutlined />
                        <span>批量导入角色图片</span>
                      </button>
                      <button
                        type="button"
                        className="scp-topbar-ops-panel__item"
                        role="menuitem"
                        disabled={ctx.batchCardGenerateMenuDisabled()}
                        onClick={ctx.handleBatchCardGenerateClick}
                      >
                        <IdcardOutlined />
                        <span>批量生成设定卡</span>
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="scp-topbar-ops-panel__item scp-topbar-ops-panel__item--danger"
                    role="menuitem"
                    disabled={ctx.batchDeleteMenuDisabled() || ctx.batchDeleteSubmitting.value}
                    onClick={ctx.handleBatchDeleteClick}
                  >
                    <DeleteOutlined />
                    <span>批量删除</span>
                  </button>
                </div>
              </div>
            )}
          >
            <Button
              type="primary"
              className="scp-topbar-batch-btn scp-topbar-ops-btn"
              loading={
                ctx.batchGenerateTopbarLoading() ||
                ctx.batchDeleteSubmitting.value ||
                ctx.batchCardGenerateSubmitting.value
              }
            >
              批量操作
              <DownOutlined
                className={`scp-topbar-ops-btn__arrow${
                  ctx.batchOpsDropdownOpen.value ? ' scp-topbar-ops-btn__arrow--open' : ''
                }`}
              />
            </Button>
          </Dropdown>
        ) : null}
      </div>
    </div>
      <ProjectOutlineModal
        open={outlineModalOpen}
        projectId={projectId}
        onOpenChange={setOutlineModalOpen}
        onSaved={() => {
          if (extractAfterOutlineSave) {
            setExtractAfterOutlineSave(false)
            ctx.emitOpenExtractModal('all', 'PROJECT_OUTLINE')
          }
        }}
      />
      <input
        ref={photoInputRef}
        className="scp-character-photo-input"
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp"
        multiple
        onChange={(event) => {
          void handleCharacterPhotoFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <Modal
        open={photoImportOpen}
        title="批量导入角色图片"
        okText={`导入已匹配的 ${matchedCount} 张`}
        cancelText="取消"
        okButtonProps={{ disabled: matchedCount === 0 }}
        confirmLoading={photoImporting}
        maskClosable={!photoImporting}
        closable={!photoImporting}
        onCancel={() => {
          if (!photoImporting) setPhotoImportOpen(false)
        }}
        onOk={() => void handleBatchPhotoImport()}
      >
        <Alert
          type={issueCount ? 'warning' : 'success'}
          showIcon
          message={`已匹配 ${matchedCount} 张${issueCount ? `，另有 ${issueCount} 张需要改名` : '，可直接导入'}`}
          description="推荐直接保留导出任务书中的文件名，例如“角色名__主形态__三视图”或“角色名__服装__山场装”。缺少的形态会自动创建，三视图自动设为主形态图。兼容旧格式“角色名__形态名”。"
        />
        <div className="scp-character-photo-match-list">
          {photoMatches.map((item) => (
            <div
              key={`${item.file.name}-${item.file.lastModified}`}
              className={`scp-character-photo-match scp-character-photo-match--${item.status}`}
            >
              <span className="scp-character-photo-match__file" title={item.file.name}>
                {item.file.name}
              </span>
              <span className="scp-character-photo-match__result">
                {item.status === 'matched' && item.target
                  ? `${item.target.characterName} / ${item.target.kind === 'main' ? '主形态' : item.target.kind === 'costume' ? '服装' : item.target.kind === 'expression' ? '表情' : item.target.kind === 'single' ? '单人图' : '形态'} / ${item.target.variantName}${item.target.formId ? '' : '（将自动创建形态）'}`
                  : item.reason}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
