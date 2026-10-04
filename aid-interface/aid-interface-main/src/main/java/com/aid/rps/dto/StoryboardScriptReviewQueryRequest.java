package com.aid.rps.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** 查询一次分镜脚本生成任务的原稿与 AI 候选稿。 */
@Data
public class StoryboardScriptReviewQueryRequest
{
    @NotNull(message = "任务ID不能为空")
    private Long taskId;
}
