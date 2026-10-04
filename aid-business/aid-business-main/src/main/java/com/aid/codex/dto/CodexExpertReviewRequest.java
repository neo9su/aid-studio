package com.aid.codex.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Codex 专家只读审查请求。 */
@Data
public class CodexExpertReviewRequest {

    @NotBlank(message = "请选择专家模式")
    private String mode;

    @NotBlank(message = "当前项目没有可供审查的内容")
    @Size(max = 80_000, message = "项目上下文过长，请缩小审查范围")
    private String context;

    @Size(max = 2_000, message = "补充要求不能超过2000字")
    private String question;

    private Long projectId;

    private Long episodeId;
}
