package com.aid.storyboard.support;

import com.aid.common.exception.ServiceException;
import com.aid.domain.vo.AiModelConfigVo;
import com.aid.storyboard.dto.StoryboardVideoGenerateRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StoryboardVideoAdvancedOptionsTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void faceSwapIsCapabilityGatedAndSurvivesSnapshotRestore() throws Exception {
        StoryboardVideoGenerateRequest request = new StoryboardVideoGenerateRequest();
        request.setFaceSwap(true);
        request.setReferenceVideoRecordIds(List.of(42L));
        StoryboardVideoAdvancedOptions.normalize(request, true);

        AiModelConfigVo config = new AiModelConfigVo();
        config.setCapabilityJson("{\"supportsFaceSwap\":true}");
        Map<String, Object> merged = StoryboardVideoAdvancedOptions.merge(Map.of(), request, config);
        assertEquals(Boolean.TRUE, merged.get("face_swap"));

        Map<String, Object> restoredOptions = StoryboardVideoAdvancedOptions.read(
            JSON.readTree("{\"videoOptions\":{\"face_swap\":true}}"));
        StoryboardVideoGenerateRequest restored = new StoryboardVideoGenerateRequest();
        StoryboardVideoAdvancedOptions.restore(restored, restoredOptions);
        assertTrue(restored.getFaceSwap());
    }

    @Test
    void faceSwapRequiresSingleShotAndOneTargetVideo() {
        StoryboardVideoGenerateRequest request = new StoryboardVideoGenerateRequest();
        request.setFaceSwap(true);
        request.setReferenceVideoRecordIds(List.of());
        assertThrows(ServiceException.class,
            () -> StoryboardVideoAdvancedOptions.normalize(request, true));

        request.setReferenceVideoRecordIds(List.of(1L));
        assertThrows(ServiceException.class,
            () -> StoryboardVideoAdvancedOptions.normalize(request, false));
    }
}
