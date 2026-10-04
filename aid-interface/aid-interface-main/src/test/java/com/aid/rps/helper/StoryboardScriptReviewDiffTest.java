package com.aid.rps.helper;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import com.aid.aid.domain.AidStoryboard;

class StoryboardScriptReviewDiffTest
{
    @Test
    void explainsAddedExecutionDetails()
    {
        AidStoryboard original = storyboard("赵小刚走进院子。", "");
        AidStoryboard suggestion = storyboard(
                "赵小刚快步走进院子，镜头从全景缓慢推进至中景，停在门前。", "");

        assertEquals("补充了动作、场景或镜头细节，使该分镜更便于直接生成画面。",
                StoryboardScriptReviewDiff.explain(original, suggestion));
    }

    @Test
    void explainsMissingSuggestionAsMergeAdvice()
    {
        assertEquals("AI 建议将该镜头合并到相邻镜头；如需保留原节奏，请选择保留原分镜。",
                StoryboardScriptReviewDiff.explain(storyboard("原分镜", ""), null));
    }

    private AidStoryboard storyboard(String story, String dialogue)
    {
        AidStoryboard row = new AidStoryboard();
        row.setStoryScript(story);
        row.setDialogueText(dialogue);
        return row;
    }
}
