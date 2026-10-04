package com.aid.rps.voice.service;

import java.math.BigDecimal;
import java.util.Date;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aid.aid.domain.AidAiModel;
import com.aid.aid.domain.AidAiProvider;
import com.aid.aid.domain.AidAiVoiceLibrary;
import com.aid.aid.domain.AidReferenceAudio;
import com.aid.aid.domain.AidRolePropScene;
import com.aid.aid.service.IAidAiModelService;
import com.aid.aid.service.IAidAiProviderService;
import com.aid.aid.service.IAidAiVoiceLibraryService;
import com.aid.aid.service.IAidReferenceAudioService;
import com.aid.aid.service.IAidRolePropSceneService;
import com.aid.common.exception.ServiceException;
import com.aid.common.utils.DateUtils;
import com.aid.media.provider.impl.QwenTtsProviderClient;
import com.aid.rps.voice.dto.RoleVoiceBindRequest;
import com.aid.rps.voice.dto.RoleVoiceCloneRequest;
import com.aid.rps.voice.vo.RoleVoiceBindingVO;
import com.aid.voice.util.VoiceLibraryOwnership;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;

import cn.hutool.core.util.StrUtil;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;

/** C 端零样本音色注册：参考音频即克隆身份，不执行耗时训练任务。 */
@Slf4j
@Service
public class RoleVoiceCloneService
{
    private static final String ENABLED = "0";
    private static final String NORMAL = "0";
    private static final String CHARACTER = "character";
    private static final long GLOBAL_EPISODE = 0L;
    private static final long MAX_SAMPLE_BYTES = 10L * 1024 * 1024 / 4 * 3;

    @Resource private IAidRolePropSceneService assets;
    @Resource private IAidReferenceAudioService referenceAudios;
    @Resource private IAidAiModelService models;
    @Resource private IAidAiProviderService providers;
    @Resource private IAidAiVoiceLibraryService voices;
    @Resource private IRoleVoiceBindingBusinessService bindings;

    @Transactional(rollbackFor = Exception.class)
    public RoleVoiceBindingVO cloneAndBind(RoleVoiceCloneRequest request, Long userId)
    {
        if (request == null || userId == null || userId <= 0 || !request.isRightsConfirmed())
        {
            throw new ServiceException("请确认音色授权");
        }
        AidRolePropScene asset = assets.getOne(Wrappers.<AidRolePropScene>lambdaQuery()
                .eq(AidRolePropScene::getId, request.getAssetId())
                .eq(AidRolePropScene::getUserId, userId)
                .eq(AidRolePropScene::getAssetType, CHARACTER)
                .eq(AidRolePropScene::getDelFlag, NORMAL).last("LIMIT 1"), false);
        if (asset == null) throw new ServiceException("角色不存在");

        long episodeId = asset.getEpisodeId() == null ? GLOBAL_EPISODE : asset.getEpisodeId();
        AidReferenceAudio sample = referenceAudios.getOne(Wrappers.<AidReferenceAudio>lambdaQuery()
                .eq(AidReferenceAudio::getId, request.getReferenceAudioId())
                .eq(AidReferenceAudio::getUserId, userId)
                .eq(AidReferenceAudio::getProjectId, asset.getProjectId())
                .and(q -> q.eq(AidReferenceAudio::getEpisodeId, episodeId)
                        .or().eq(AidReferenceAudio::getEpisodeId, GLOBAL_EPISODE))
                .eq(AidReferenceAudio::getStatus, ENABLED)
                .eq(AidReferenceAudio::getDelFlag, NORMAL).last("LIMIT 1"), false);
        validateSample(sample);

        AidAiModel model = findAvailableModel();
        if (model == null) throw new ServiceException("音色克隆服务未启用");

        Date now = DateUtils.getNowDate();
        AidAiVoiceLibrary voice = new AidAiVoiceLibrary();
        voice.setProviderId(model.getProviderId());
        voice.setModelId(model.getId());
        voice.setVoiceCode("qwen_clone_u" + userId + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        voice.setVoiceName(request.getVoiceName().trim());
        voice.setSampleUrl(sample.getAudioUrl());
        voice.setSampleText(StrUtil.trim(request.getSampleText()));
        voice.setLanguage(request.getLanguage());
        voice.setGender(request.getGender());
        voice.setAgeRange(request.getAgeRange());
        voice.setSupportsEmotion(false);
        voice.setSupportsSpeed(false);
        voice.setSupportsPitch(false);
        voice.setDefaultSpeed(BigDecimal.ONE);
        voice.setDefaultPitch(BigDecimal.ZERO);
        voice.setSampleRate(24000);
        voice.setAudioFormat(sample.getAudioFormat());
        voice.setOfflineTime(cn.hutool.core.date.DateUtil.parse("9999-12-31 00:00:00"));
        voice.setSortOrder(1000);
        voice.setStatus(ENABLED);
        voice.setDelFlag(NORMAL);
        voice.setCreateBy(VoiceLibraryOwnership.owner(userId));
        voice.setCreateTime(now);
        voice.setUpdateBy(VoiceLibraryOwnership.owner(userId));
        voice.setUpdateTime(now);
        if (!voices.save(voice)) throw new ServiceException("克隆音色保存失败");

        RoleVoiceBindRequest bind = new RoleVoiceBindRequest();
        bind.setAssetId(asset.getId());
        bind.setVoiceLibraryId(voice.getId());
        bind.setReferenceAudioId(sample.getId());
        RoleVoiceBindingVO result = bindings.bindVoice(bind, userId);
        log.info("用户克隆音色已创建并绑定: userId={}, assetId={}, voiceId={}, sampleId={}",
                userId, asset.getId(), voice.getId(), sample.getId());
        return result;
    }

    public Map<String, Object> status()
    {
        boolean enabled = findAvailableModel() != null;
        return Map.of("enabled", enabled,
                "model", "Qwen3-TTS Base",
                "message", enabled ? "音色克隆服务可用" : "音色克隆服务未启用");
    }

    private AidAiModel findAvailableModel()
    {
        AidAiModel model = models.getOne(Wrappers.<AidAiModel>lambdaQuery()
                .eq(AidAiModel::getProtocol, QwenTtsProviderClient.PROTOCOL)
                .eq(AidAiModel::getModelType, "audio")
                .eq(AidAiModel::getStatus, ENABLED)
                .eq(AidAiModel::getDelFlag, NORMAL)
                .orderByDesc(AidAiModel::getId).last("LIMIT 1"), false);
        if (model == null) return null;
        AidAiProvider provider = providers.getById(model.getProviderId());
        if (provider == null || !ENABLED.equals(provider.getStatus()) || !NORMAL.equals(provider.getDelFlag()))
        {
            return null;
        }
        return model;
    }

    private void validateSample(AidReferenceAudio sample)
    {
        if (sample == null || StrUtil.isBlank(sample.getAudioUrl())) throw new ServiceException("音频不存在");
        String format = StrUtil.nullToEmpty(sample.getAudioFormat()).toLowerCase();
        if (!Set.of("wav", "mp3").contains(format)) throw new ServiceException("仅支持 WAV 或 MP3");
        if (sample.getFileSize() != null && sample.getFileSize() > MAX_SAMPLE_BYTES)
            throw new ServiceException("音频不能超过 7.5MB");
        if (sample.getDurationMs() == null || sample.getDurationMs() < 1000 || sample.getDurationMs() > 60000)
            throw new ServiceException("音频时长需为 1-60 秒");
    }
}
