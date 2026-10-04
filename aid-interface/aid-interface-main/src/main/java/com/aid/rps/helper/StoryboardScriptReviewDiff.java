package com.aid.rps.helper;

import com.aid.aid.domain.AidStoryboard;

/** 为分镜改写审核生成稳定、可解释的修改理由。 */
public final class StoryboardScriptReviewDiff
{
    private StoryboardScriptReviewDiff()
    {
    }

    public static String explain(AidStoryboard original, AidStoryboard suggestion)
    {
        if (original == null)
        {
            return "AI 根据剧情补充了新的镜头，用于承接动作、对白或场景变化。";
        }
        if (suggestion == null)
        {
            return "AI 建议将该镜头合并到相邻镜头；如需保留原节奏，请选择保留原分镜。";
        }
        String oldStory = normalize(original.getStoryScript());
        String newStory = normalize(suggestion.getStoryScript());
        String oldDialogue = normalize(original.getDialogueText());
        String newDialogue = normalize(suggestion.getDialogueText());
        boolean storyChanged = !oldStory.equals(newStory);
        boolean dialogueChanged = !oldDialogue.equals(newDialogue);
        if (!storyChanged && !dialogueChanged)
        {
            return "主要调整了标题或格式，剧情内容与原分镜基本一致。";
        }
        if (!storyChanged)
        {
            return "保留原画面内容，重新拆分或整理了对白，便于配音和镜头节奏控制。";
        }
        double ratio = oldStory.isEmpty() ? 2D : (double) newStory.length() / oldStory.length();
        if (ratio >= 1.25D)
        {
            return dialogueChanged
                    ? "补充了动作、场景和镜头细节，并调整对白，使画面执行信息更完整。"
                    : "补充了动作、场景或镜头细节，使该分镜更便于直接生成画面。";
        }
        if (ratio <= 0.75D)
        {
            return dialogueChanged
                    ? "压缩了画面描述并整理对白，减少单镜头信息量，提升节奏。"
                    : "压缩了重复描述，减少单镜头信息量，提升节奏。";
        }
        return dialogueChanged
                ? "重新组织了画面动作与对白，以适配镜头连续性和生成模型执行。"
                : "重新组织了画面动作和镜头表达，以增强连续性与可执行性。";
    }

    private static String normalize(String value)
    {
        return value == null ? "" : value.replaceAll("\\s+", "").trim();
    }
}
