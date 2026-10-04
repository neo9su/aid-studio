package com.aid.rps.dto;

import java.util.List;

import lombok.Builder;
import lombok.Data;

/** 分镜脚本 AI 改写审核数据。 */
@Data
@Builder
public class StoryboardScriptReviewVO
{
    private Long taskId;
    private String status;
    private Boolean applied;
    private List<Item> originals;
    private List<Item> suggestions;

    @Data
    @Builder
    public static class Item
    {
        private Long storyboardId;
        private Long sortOrder;
        private String title;
        private String storyScript;
        private String dialogueText;
        /** 与同位置另一版本比较后得到的可解释修改理由。 */
        private String reason;
    }
}
