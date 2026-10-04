package com.aid.storyboard.service.impl;

import com.aid.domain.vo.AiModelConfigVo;
import com.aid.common.config.AidAppConfig;
import com.aid.rps.model.StoryboardSceneContext;
import com.aid.storyboard.dto.StoryboardVideoGenerateRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StoryboardVideoGenerationServiceImplDefaultSceneReferenceTest
{
    @TempDir
    Path tempDir;

    @Test
    void imageToVideoUsesSceneImageWhenPromptHasNoReference()
    {
        String prompt = "人物从门外走进屋内。";
        String result = StoryboardVideoGenerationServiceImpl.prependDefaultSceneReference(
                prompt, imageToVideoModel(), scene("宋雨晴家门外_中午_主视"), false);

        assertTrue(result.startsWith("@图片1[宋雨晴家门外_中午_主视] 作为首帧场景、构图与光线参考。\n"));
        assertTrue(result.endsWith(prompt));
    }

    @Test
    void existingPromptReferenceAlwaysWins()
    {
        String prompt = "@图片1[赵小刚_角色设定] 人物转身。";
        String result = StoryboardVideoGenerationServiceImpl.prependDefaultSceneReference(
                prompt, imageToVideoModel(), scene("宋雨晴家门外_中午_主视"), false);

        assertSame(prompt, result);
    }

    @Test
    void explicitBaseImageAlwaysWins()
    {
        String prompt = "人物转身。";
        String result = StoryboardVideoGenerationServiceImpl.prependDefaultSceneReference(
                prompt, imageToVideoModel(), scene("宋雨晴家门外_中午_主视"), true);

        assertSame(prompt, result);
    }

    @Test
    void textToVideoDoesNotReceiveSyntheticImageReference()
    {
        AiModelConfigVo model = imageToVideoModel();
        model.setCapabilityCode("text_to_video");
        String prompt = "人物转身。";

        assertEquals(prompt, StoryboardVideoGenerationServiceImpl.prependDefaultSceneReference(
                prompt, model, scene("宋雨晴家门外_中午_主视"), false));
    }

    @Test
    void referenceToVideoUsesSceneImageWhenPromptHasNoReference()
    {
        AiModelConfigVo model = imageToVideoModel();
        model.setCapabilityCode("reference_to_video");
        model.setGenerateMode("reference_to_video");
        String prompt = "人物从门外走进屋内。";

        String result = StoryboardVideoGenerationServiceImpl.prependDefaultSceneReference(
                prompt, model, scene("宋雨晴家门外_中午_主视"), false);

        assertTrue(result.startsWith("@图片1[宋雨晴家门外_中午_主视] 作为场景、构图与光线参考。\n"));
        assertTrue(result.endsWith(prompt));
    }

    @Test
    void h3WithoutReferencesUsesTextToVideo()
    {
        StoryboardVideoGenerateRequest request = new StoryboardVideoGenerateRequest();
        request.setVideoPrompt("人物从院门走入院内。");

        assertEquals("text_to_video", StoryboardVideoGenerationServiceImpl.inferH3MultiCapability(request));
    }

    @Test
    void h3WithPromptImageReferenceUsesReferenceToVideo()
    {
        StoryboardVideoGenerateRequest request = new StoryboardVideoGenerateRequest();
        request.setVideoPrompt("@图片1[李翠花] 人物从院门走入院内。");

        assertEquals("reference_to_video", StoryboardVideoGenerationServiceImpl.inferH3MultiCapability(request));
    }

    @Test
    void bothH3ProviderProtocolsUseReferenceAwareCapabilitySelection()
    {
        assertTrue(StoryboardVideoGenerationServiceImpl.isH3MultiProtocol("minimax-h3-video"));
        assertTrue(StoryboardVideoGenerationServiceImpl.isH3MultiProtocol("dmc-h3-video"));
        assertTrue(!StoryboardVideoGenerationServiceImpl.isH3MultiProtocol("openai-video"));
    }

    @Test
    void agnesVideoUsesReferenceAwareCapabilitySelection()
    {
        assertTrue(StoryboardVideoGenerationServiceImpl.isReferenceAwareMultiProtocol("agnes-video"));
        assertTrue(StoryboardVideoGenerationServiceImpl.isReferenceAwareMultiProtocol("minimax-h3-video"));
        assertTrue(!StoryboardVideoGenerationServiceImpl.isReferenceAwareMultiProtocol("openai-video"));

        StoryboardVideoGenerateRequest textOnly = new StoryboardVideoGenerateRequest();
        textOnly.setVideoPrompt("人物从院门走入院内。");
        assertEquals("text_to_video",
                StoryboardVideoGenerationServiceImpl.inferReferenceAwareMultiCapability(textOnly));

        StoryboardVideoGenerateRequest withReference = new StoryboardVideoGenerateRequest();
        withReference.setVideoPrompt("@图片1[人物参考] 人物从院门走入院内。");
        assertEquals("reference_to_video",
                StoryboardVideoGenerationServiceImpl.inferReferenceAwareMultiCapability(withReference));
    }

    @Test
    void localUploadedProfileImageIsAcceptedForVideoReference() throws Exception
    {
        Path image = tempDir.resolve("upload/character.png");
        Files.createDirectories(image.getParent());
        Files.write(image, "png-bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String previousProfile = AidAppConfig.getProfile();
        new AidAppConfig().setProfile(tempDir.toString());
        try
        {
            assertTrue(StoryboardVideoGenerationServiceImpl.isReadableVideoReferenceImage(
                    "/profile/upload/character.png",
                    "http://127.0.0.1:18081/profile/upload/character.png"));
        }
        finally
        {
            new AidAppConfig().setProfile(previousProfile);
        }
    }

    @Test
    void missingLocalProfileImageIsRejectedForVideoReference()
    {
        String previousProfile = AidAppConfig.getProfile();
        new AidAppConfig().setProfile(tempDir.toString());
        try
        {
            assertTrue(!StoryboardVideoGenerationServiceImpl.isReadableVideoReferenceImage(
                    "/profile/upload/missing.png",
                    "http://127.0.0.1:18081/profile/upload/missing.png"));
        }
        finally
        {
            new AidAppConfig().setProfile(previousProfile);
        }
    }

    private static AiModelConfigVo imageToVideoModel()
    {
        AiModelConfigVo model = new AiModelConfigVo();
        model.setCapabilityCode("image_to_video");
        model.setGenerateMode("image_to_video");
        model.setSupportsImageInput(true);
        return model;
    }

    private static StoryboardSceneContext scene(String referenceImageName)
    {
        return new StoryboardSceneContext(1L, 2L, "宋雨晴家门外_中午", "乡村院门", referenceImageName);
    }
}
