package com.aid.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 项目内容与发布合规模式。
 *
 * <p>该模式用于贯穿剧本、资产、分镜、提示词和发布检查。私人自用模式并不关闭
 * 不可豁免的安全底线（例如未成年人色情和非自愿私密内容）。</p>
 */
@Getter
@AllArgsConstructor
public enum ProjectComplianceProfileEnum {

    PRIVATE_ADULT("PRIVATE_ADULT", "私人自用（成人内容）"),
    CN_MAINLAND("CN_MAINLAND", "中国大陆发布"),
    US_PLATFORMS("US_PLATFORMS", "美国平台发布（YouTube / TikTok）");

    @EnumValue
    private final String value;
    private final String desc;

    @JsonValue
    public String getValue() {
        return value;
    }

    public static ProjectComplianceProfileEnum getByValue(String value) {
        if (value == null) {
            return null;
        }
        for (ProjectComplianceProfileEnum profile : values()) {
            if (profile.value.equalsIgnoreCase(value.trim())) {
                return profile;
            }
        }
        return null;
    }
}
