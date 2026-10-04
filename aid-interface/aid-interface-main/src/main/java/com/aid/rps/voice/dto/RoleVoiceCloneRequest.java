package com.aid.rps.voice.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 将用户已登记的参考音频注册为角色私有的 Qwen 克隆音色。 */
@Data
public class RoleVoiceCloneRequest
{
    @NotNull(message = "角色不能空")
    private Long assetId;

    @NotNull(message = "音频不能空")
    private Long referenceAudioId;

    @NotBlank(message = "名称不能空")
    @Size(max = 100, message = "名称过长")
    private String voiceName;

    @Size(max = 500, message = "样本文案过长")
    private String sampleText;

    @NotBlank(message = "语言不能空")
    private String language;

    @NotBlank(message = "性别不能空")
    private String gender;

    @NotBlank(message = "年龄不能空")
    private String ageRange;

    @AssertTrue(message = "请确认音色授权")
    private boolean rightsConfirmed;
}
