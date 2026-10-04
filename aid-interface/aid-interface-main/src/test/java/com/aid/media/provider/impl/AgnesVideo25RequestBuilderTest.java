package com.aid.media.provider.impl;

import com.aid.common.config.AidAppConfig;
import com.aid.domain.vo.AiModelConfigVo;
import com.aid.media.dto.MediaVideoGenerateRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AgnesVideo25RequestBuilderTest {

    @TempDir
    Path tempDir;

    @Test
    void inlinesLocalProfileReferenceImage() throws Exception {
        Path image = tempDir.resolve("upload/reference.png");
        Files.createDirectories(image.getParent());
        Files.write(image, "png-bytes".getBytes(StandardCharsets.UTF_8));
        String previousProfile = AidAppConfig.getProfile();
        new AidAppConfig().setProfile(tempDir.toString());
        try {
            Map<String, Object> body = AgnesVideo25RequestBuilder.buildSubmissionBody(
                    "agnes-video-2.5-flash", model(), referenceRequest("/profile/upload/reference.png"));

            assertEquals(List.of("data:image/png;base64,cG5nLWJ5dGVz"), body.get("images"));
        } finally {
            new AidAppConfig().setProfile(previousProfile);
        }
    }

    @Test
    void inlinesLoopbackProfileKeyframe() throws Exception {
        Path image = tempDir.resolve("upload/frame.png");
        Files.createDirectories(image.getParent());
        Files.write(image, "frame-bytes".getBytes(StandardCharsets.UTF_8));
        String previousProfile = AidAppConfig.getProfile();
        new AidAppConfig().setProfile(tempDir.toString());
        try {
            MediaVideoGenerateRequest request = baseRequest();
            request.setImageUrl("http://127.0.0.1:18081/profile/upload/frame.png");
            request.setOptions(new LinkedHashMap<>(Map.of("mode", "keyframe", "resolution", "720P")));

            Map<String, Object> body = AgnesVideo25RequestBuilder.buildSubmissionBody(
                    "agnes-video-2.5-flash", model(), request);

            assertEquals("data:image/png;base64,ZnJhbWUtYnl0ZXM=", body.get("first_frame"));
        } finally {
            new AidAppConfig().setProfile(previousProfile);
        }
    }

    @Test
    void keepsPublicReferenceUrlWhenBase64SwitchIsOff() {
        String url = "https://cdn.example.com/reference.png";

        Map<String, Object> body = AgnesVideo25RequestBuilder.buildSubmissionBody(
                "agnes-video-2.5-flash", model(), referenceRequest(url));

        assertEquals(List.of(url), body.get("images"));
    }

    private static MediaVideoGenerateRequest referenceRequest(String image) {
        MediaVideoGenerateRequest request = baseRequest();
        request.setOptions(new LinkedHashMap<>(Map.of(
                "mode", "reference",
                "resolution", "720P",
                "referenceImages", List.of(image))));
        return request;
    }

    private static MediaVideoGenerateRequest baseRequest() {
        MediaVideoGenerateRequest request = new MediaVideoGenerateRequest();
        request.setPrompt("A calm cinematic shot");
        request.setDurationSeconds(8);
        request.setAspectRatio("16:9");
        return request;
    }

    private static AiModelConfigVo model() {
        AiModelConfigVo config = new AiModelConfigVo();
        config.setModelCode("agnes-video-2.5-flash");
        config.setRealModelCode("agnes-video-2.5-flash");
        config.setCapabilityJson("{}");
        return config;
    }
}
