package com.aid.rps.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 提交一次分镜脚本生成任务的人工审核结果。 */
@Data
public class StoryboardScriptReviewRequest
{
    @NotNull(message = "任务ID不能为空")
    private Long taskId;

    @Valid
    @NotEmpty(message = "审核结果不能为空")
    @Size(max = 5000, message = "审核数量过多")
    private List<Item> items;

    @Data
    public static class Item
    {
        /** ORIGINAL / SUGGESTION / MANUAL。 */
        @NotNull(message = "审核决定不能为空")
        private String decision;

        /** 被选为最终版本的原分镜或 AI 候选分镜 ID。 */
        @NotNull(message = "分镜ID不能为空")
        private Long storyboardId;

        /** MANUAL 时写回的人工标题。 */
        @Size(max = 200, message = "分镜标题过长")
        private String title;

        /** MANUAL 时写回的人工分镜内容。 */
        @Size(max = 20000, message = "分镜内容过长")
        private String storyScript;

        /** MANUAL 时写回的人工台词。 */
        @Size(max = 10000, message = "分镜台词过长")
        private String dialogueText;
    }
}
