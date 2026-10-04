package com.aid.storyboard.service.impl;

import com.aid.rps.model.StoryboardSceneContext;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StoryboardVideoGenerationServiceImplAutomaticReferenceTest
{
    @Test
    void fillsScriptAssetsWithoutDuplicatingExistingReference()
    {
        String prompt = "@图片1[柴李子] 赵小刚在村道上捡起柴李子。";

        StoryboardVideoGenerationServiceImpl.AutomaticReferencePlan plan =
                StoryboardVideoGenerationServiceImpl.appendAutomaticAssetReferences(
                        prompt,
                        "[赵小刚_初始形象_角色设定]、[柴李子]、[村道_上午_主视]",
                        "村道_上午_主视",
                        prompt,
                        assets(),
                        4);

        assertEquals(List.of("赵小刚_初始形象_角色设定", "村道_上午_主视"), plan.addedNames());
        assertTrue(plan.prompt().contains("@图片2[赵小刚_初始形象_角色设定]"));
        assertTrue(plan.prompt().contains("@图片3[村道_上午_主视]"));
        assertEquals(1, occurrences(plan.prompt(), "@图片1[柴李子]"));
    }

    @Test
    void fillsSceneAndCharacterMentionWhenScriptReferenceInfoIsMissing()
    {
        StoryboardVideoGenerationServiceImpl.AutomaticReferencePlan plan =
                StoryboardVideoGenerationServiceImpl.appendAutomaticAssetReferences(
                        "人物转身看向门外。",
                        "",
                        "村道_上午_主视",
                        "宋雨晴从屋里走到村道。",
                        assets(),
                        4);

        assertEquals(List.of("村道_上午_主视", "宋雨晴_初始形象_角色设定"), plan.addedNames());
        assertTrue(plan.prompt().contains("@图片1[村道_上午_主视]"));
        assertTrue(plan.prompt().contains("@图片2[宋雨晴_初始形象_角色设定]"));
    }

    @Test
    void neverExceedsRemainingModelReferenceSlots()
    {
        String prompt = "@图片1[柴李子] 人物在村道上。";

        StoryboardVideoGenerationServiceImpl.AutomaticReferencePlan plan =
                StoryboardVideoGenerationServiceImpl.appendAutomaticAssetReferences(
                        prompt,
                        "[赵小刚]、[村道_上午_主视]",
                        "村道_上午_主视",
                        prompt,
                        assets(),
                        2);

        assertEquals(List.of("赵小刚_初始形象_角色设定"), plan.addedNames());
        assertTrue(plan.prompt().contains("@图片2[赵小刚_初始形象_角色设定]"));
        assertFalse(plan.prompt().contains("@图片3["));
    }

    @Test
    void rewritesWholeSceneGridReferenceToSelectedDirection()
    {
        StoryboardSceneContext context = new StoryboardSceneContext(
                31L, 42L, "村道_上午", "乡村道路", "村道_上午_右立面");

        String result = StoryboardVideoGenerationServiceImpl.alignSceneReferenceToSelectedView(
                "@图片1[村道_上午] 作为场景参考。@图片2[赵小刚] 作为人物参考。", context);

        assertEquals("@图片1[村道_上午_右立面] 作为场景参考。@图片2[赵小刚] 作为人物参考。", result);
    }

    @Test
    void keepsExplicitSceneDirectionUntouched()
    {
        StoryboardSceneContext context = new StoryboardSceneContext(
                31L, 42L, "村道_上午", "乡村道路", "村道_上午_右立面");

        String result = StoryboardVideoGenerationServiceImpl.alignSceneReferenceToSelectedView(
                "@图片1[村道_上午_反打] 作为场景参考。", context);

        assertEquals("@图片1[村道_上午_反打] 作为场景参考。", result);
    }

    @Test
    void recognizesOnlyExplicitFourViewScenePrompts()
    {
        assertTrue(StoryboardVideoGenerationServiceImpl.isFourViewScenePrompt(
                "生成一张 2×2 四宫格场景设定图，只能出现 4 个等大子画面"));
        assertFalse(StoryboardVideoGenerationServiceImpl.isFourViewScenePrompt(
                "生成一张电影感乡村道路场景图"));
    }

    private static List<StoryboardVideoGenerationServiceImpl.AutomaticReferenceAsset> assets()
    {
        return List.of(
                asset(1L, "character", "赵小刚_初始形象_角色设定", "赵小刚"),
                asset(2L, "character", "宋雨晴_初始形象_角色设定", "宋雨晴"),
                asset(3L, "scene", "村道_上午_主视", "村道"),
                asset(4L, "prop", "柴李子", "柴李子"));
    }

    private static StoryboardVideoGenerationServiceImpl.AutomaticReferenceAsset asset(
            Long id, String type, String imageName, String assetName)
    {
        return new StoryboardVideoGenerationServiceImpl.AutomaticReferenceAsset(
                id, type, imageName, List.of(imageName), List.of(imageName, assetName), List.of(assetName));
    }

    private static int occurrences(String source, String token)
    {
        return (source.length() - source.replace(token, "").length()) / token.length();
    }
}
