package com.aid.media.provider.impl;

import com.aid.common.aid.oss.util.MediaUrlResolver;
import com.aid.common.config.AidAppConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AgnesImageProviderClientTest {

    @TempDir
    Path tempDir;

    @Test
    void resolvesStoredProfilePathBeforeSendingReferenceImage() {
        MediaUrlResolver resolver = mock(MediaUrlResolver.class);
        when(resolver.toFullUrl("/profile/upload/reference.png"))
                .thenReturn("http://127.0.0.1:18081/profile/upload/reference.png");
        AgnesImageProviderClient client = new AgnesImageProviderClient();
        ReflectionTestUtils.setField(client, "mediaUrlResolver", resolver);

        assertEquals(
                List.of("http://127.0.0.1:18081/profile/upload/reference.png"),
                client.normalizeReferenceImageUrls(List.of("/profile/upload/reference.png")));
    }

    @Test
    void keepsInlineImageDataUnchanged() {
        MediaUrlResolver resolver = mock(MediaUrlResolver.class);
        AgnesImageProviderClient client = new AgnesImageProviderClient();
        ReflectionTestUtils.setField(client, "mediaUrlResolver", resolver);

        String dataUri = "data:image/png;base64,aGVsbG8=";
        assertEquals(List.of(dataUri), client.normalizeReferenceImageUrls(List.of(dataUri)));
    }

    @Test
    void stripsDataUriPrefixForAgnesRawBase64Payload() {
        String dataUri = "data:image/png;base64,aGVsbG8=";

        assertEquals(
                List.of("aGVsbG8="),
                com.aid.media.provider.ReferenceImageBase64Support.toRawBase64s(List.of(dataUri)));
    }

    @Test
    void convertsStoredProfilePathToDataUriWithoutPublicDomain() throws Exception {
        Path image = tempDir.resolve("upload/reference.png");
        Files.createDirectories(image.getParent());
        Files.write(image, "png-bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String previousProfile = AidAppConfig.getProfile();
        new AidAppConfig().setProfile(tempDir.toString());
        try {
            assertTrue(com.aid.media.provider.ReferenceImageBase64Support
                    .isReadableLocalProfileImage("/profile/upload/reference.png"));
            assertTrue(com.aid.media.provider.ReferenceImageBase64Support
                    .isReadableLocalProfileImage("http://127.0.0.1:18081/profile/upload/reference.png"));
            assertFalse(com.aid.media.provider.ReferenceImageBase64Support
                    .isReadableLocalProfileImage("/profile/upload/missing.png"));
            assertFalse(com.aid.media.provider.ReferenceImageBase64Support
                    .isReadableLocalProfileImage("/profile/../reference.png"));
            List<String> converted = com.aid.media.provider.ReferenceImageBase64Support
                    .toDataUris(List.of("/profile/upload/reference.png"));

            assertEquals(List.of("data:image/png;base64,cG5nLWJ5dGVz"), converted);
        } finally {
            new AidAppConfig().setProfile(previousProfile);
        }
    }
}
