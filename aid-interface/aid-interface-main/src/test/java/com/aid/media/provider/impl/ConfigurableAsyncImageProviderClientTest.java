package com.aid.media.provider.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.Test;

import com.aid.common.config.AidAppConfig;
import com.aid.media.dto.MediaImageGenerateRequest;

class ConfigurableAsyncImageProviderClientTest {

    @TempDir
    Path tempDir;

    @Test
    void resolvesSnakeCaseAspectRatioFirst() {
        MediaImageGenerateRequest request = new MediaImageGenerateRequest();
        request.setOptions(Map.of("aspect_ratio", "16:9", "aspectRatio", "1:1"));

        assertEquals("16:9", ConfigurableAsyncImageProviderClient.resolveAspectRatio(request));
    }

    @Test
    void resolvesCamelCaseAspectRatio() {
        MediaImageGenerateRequest request = new MediaImageGenerateRequest();
        request.setOptions(Map.of("aspectRatio", "9:16"));

        assertEquals("9:16", ConfigurableAsyncImageProviderClient.resolveAspectRatio(request));
    }

    @Test
    void missingAspectRatioIsNull() {
        assertNull(ConfigurableAsyncImageProviderClient.resolveAspectRatio(new MediaImageGenerateRequest()));
    }

    @Test
    void supportsFourReferenceImagesForLocalCompositeAdapter() {
        assertEquals(4, new ConfigurableAsyncImageProviderClient().fallbackMaxReferenceImages(null));
    }

    @Test
    void readsLocalProfileReferenceWithoutLoopbackHttpValidation() throws Exception {
        byte[] expected = "local-reference".getBytes(StandardCharsets.UTF_8);
        Path image = tempDir.resolve("upload/images/reference.png");
        Files.createDirectories(image.getParent());
        Files.write(image, expected);
        String previousProfile = AidAppConfig.getProfile();
        new AidAppConfig().setProfile(tempDir.toString());
        try {
            assertArrayEquals(expected, ConfigurableAsyncImageProviderClient.downloadReferenceImage(
                    "http://127.0.0.1:18081/profile/upload/images/reference.png"));
        } finally {
            new AidAppConfig().setProfile(previousProfile);
        }
    }
}
