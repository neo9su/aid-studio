package com.aid.media.provider.impl;

import com.aid.domain.vo.AiModelConfigVo;
import com.aid.media.dto.MediaAudioGenerateRequest;
import com.aid.voice.service.VoiceReferenceSampleService;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QwenTtsProviderClientTest {

    @Test
    void buildsEphemeralReferenceClonePayload() {
        AiModelConfigVo config = new AiModelConfigVo();
        config.setRealModelCode("Qwen/Qwen3-TTS-12Hz-1.7B-Base");
        MediaAudioGenerateRequest request = new MediaAudioGenerateRequest();
        request.setTtsText("你好，这是克隆音色测试。");
        request.setVoiceCode("voice_demo");
        request.setLanguage("Chinese");
        request.setSampleRate(24000);
        byte[] sampleBytes = "fake-wav-for-payload-test".getBytes(StandardCharsets.UTF_8);

        Map<String, Object> payload = QwenTtsProviderClient.buildPayload(config, request,
                new VoiceReferenceSampleService.Sample(sampleBytes, "audio/wav"));

        assertEquals("Qwen/Qwen3-TTS-12Hz-1.7B-Base", payload.get("model"));
        assertEquals("你好，这是克隆音色测试。", payload.get("input"));
        assertEquals("Chinese", payload.get("language"));
        assertEquals("wav", payload.get("response_format"));
        assertEquals(Boolean.TRUE, payload.get("x_vector_only_mode"));
        assertEquals(Base64.getEncoder().encodeToString(sampleBytes), payload.get("ref_audio"));
    }

    @Test
    void marksLocalQwenProtocolAsReferenceModel() {
        AiModelConfigVo config = new AiModelConfigVo();
        config.setProviderCode("qwen-tts-local");
        config.setProtocol(QwenTtsProviderClient.PROTOCOL);

        assertTrue(VoiceReferenceSampleService.isReferenceModel(config));
    }
}
