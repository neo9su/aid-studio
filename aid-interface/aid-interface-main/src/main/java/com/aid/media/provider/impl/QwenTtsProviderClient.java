package com.aid.media.provider.impl;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import com.aid.common.exception.ServiceException;
import com.aid.common.oss.entity.UploadResult;
import com.aid.common.oss.factory.OssFactory;
import com.aid.common.utils.ProviderEndpointUtils;
import com.aid.domain.vo.AiModelConfigVo;
import com.aid.media.dto.MediaAudioGenerateRequest;
import com.aid.media.provider.AudioProviderClient;
import com.aid.media.provider.ModelCodeResolver;
import com.aid.media.provider.ProviderSubmitResult;
import com.aid.media.provider.ProviderTaskResult;
import com.aid.media.util.AudioDurationProber;
import com.aid.voice.service.VoiceReferenceSampleService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** 本地 Qwen3-TTS Base 适配器：参考样本只在提交时以内存 Base64 发送，不写入任务快照。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class QwenTtsProviderClient implements AudioProviderClient {
    public static final String PROTOCOL = "local:qwen3:tts";
    private static final String DEFAULT_PATH = "/v1/audio/speech";
    private static final int MAX_RESPONSE_BYTES = 96 * 1024 * 1024;
    private static final ObjectMapper JSON = new ObjectMapper();
    private final VoiceReferenceSampleService referenceSamples;

    @Override public String protocol() { return PROTOCOL; }

    @Override
    public boolean supportsProviderCode(String code) {
        String value = StrUtil.nullToEmpty(code).trim().toLowerCase();
        return Set.of("qwen-tts-local", "qwen_tts", "qwen3_tts").contains(value);
    }

    @Override
    public boolean supportsModel(String name) {
        String value = StrUtil.nullToEmpty(name).toLowerCase();
        return value.contains("qwen3-tts") || value.contains("qwen-tts");
    }

    @Override
    public ProviderSubmitResult submit(AiModelConfigVo config, MediaAudioGenerateRequest request) {
        validate(config, request);
        VoiceReferenceSampleService.Sample sample = referenceSamples.forSubmission(request);
        Map<String, Object> payload = buildPayload(config, request, sample);
        String path = StrUtil.blankToDefault(config.getApiSuffix(), DEFAULT_PATH);
        String url = ProviderEndpointUtils.buildSubmitUrl(config.getBaseUrl(), path);
        try (HttpResponse response = request(url, config, JSON.writeValueAsString(payload))) {
            if (!response.isOk()) {
                log.info("QwenTTS 请求失败: status={}, model={}", response.getStatus(), config.getModelCode());
                return ProviderSubmitResult.builder().rawResponse("Qwen TTS HTTP " + response.getStatus()).build();
            }
            byte[] audio = decodeAudio(response);
            if (audio.length == 0 || audio.length > MAX_RESPONSE_BYTES) {
                return ProviderSubmitResult.builder().rawResponse("Qwen TTS 音频响应无效").build();
            }
            Integer duration = AudioDurationProber.probeDurationMs(audio);
            if (request.isPreviewMode()) {
                return ProviderSubmitResult.builder()
                        .audioBase64(Base64.getEncoder().encodeToString(audio))
                        .audioDurationMs(duration == null ? null : duration.longValue()).build();
            }
            UploadResult uploaded = OssFactory.instance().uploadSuffix(audio, ".wav", "audio/wav");
            if (uploaded == null || StrUtil.isBlank(uploaded.getUrl())) {
                return ProviderSubmitResult.builder().rawResponse("Qwen TTS 音频保存失败").build();
            }
            return ProviderSubmitResult.builder().ossUrl(uploaded.getUrl())
                    .audioDurationMs(duration == null ? null : duration.longValue()).build();
        } catch (ServiceException ex) {
            throw ex;
        } catch (Exception ex) {
            log.info("QwenTTS 调用失败: model={}, cause={}", config.getModelCode(), ex.getClass().getSimpleName());
            throw new ServiceException("Qwen TTS 服务不可用");
        }
    }

    static Map<String, Object> buildPayload(AiModelConfigVo config, MediaAudioGenerateRequest request,
                                            VoiceReferenceSampleService.Sample sample) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", ModelCodeResolver.resolveUpstreamModel(config, request.getModelName()));
        payload.put("input", request.getTtsText());
        payload.put("voice", request.getVoiceCode());
        payload.put("language", StrUtil.blankToDefault(request.getLanguage(), "Auto"));
        payload.put("response_format", "wav");
        payload.put("sample_rate", request.getSampleRate() == null ? 24000 : request.getSampleRate());
        payload.put("x_vector_only_mode", true);
        payload.put("ref_audio", Base64.getEncoder().encodeToString(sample.bytes()));
        payload.put("ref_audio_mime", sample.mime());
        return payload;
    }

    static byte[] decodeAudio(HttpResponse response) throws Exception {
        String contentType = StrUtil.nullToEmpty(response.header("Content-Type")).toLowerCase();
        byte[] body = response.bodyBytes();
        if (!contentType.contains("json")) return body == null ? new byte[0] : body;
        JsonNode root = JSON.readTree(body);
        String encoded = root.path("audio").asText();
        if (StrUtil.isBlank(encoded)) encoded = root.path("data").path("audio").asText();
        if (encoded.startsWith("data:")) encoded = encoded.substring(encoded.indexOf(',') + 1);
        return StrUtil.isBlank(encoded) ? new byte[0] : Base64.getDecoder().decode(encoded);
    }

    private HttpResponse request(String url, AiModelConfigVo config, String body) {
        HttpRequest request = HttpRequest.post(url).timeout(300_000).header("Content-Type", "application/json");
        if (StrUtil.isNotBlank(config.getApiKey())) request.header("Authorization", "Bearer " + config.getApiKey());
        return request.body(body).execute();
    }

    private void validate(AiModelConfigVo config, MediaAudioGenerateRequest request) {
        if (config == null || request == null || StrUtil.isBlank(config.getBaseUrl())) throw new ServiceException("Qwen TTS 配置无效");
        if (StrUtil.isBlank(request.getTtsText())) throw new ServiceException("配音文本不能为空");
        if (StrUtil.isNotBlank(request.getAudioFormat()) && !"wav".equalsIgnoreCase(request.getAudioFormat())) {
            throw new ServiceException("Qwen TTS 当前仅支持 WAV 输出");
        }
    }

    @Override
    public ProviderTaskResult query(AiModelConfigVo config, String taskId) {
        return ProviderTaskResult.builder().status("PROCESSING").querySuccessful(false).terminalConfirmed(false)
                .errorMessage("同步音频无需查询").build();
    }
}
