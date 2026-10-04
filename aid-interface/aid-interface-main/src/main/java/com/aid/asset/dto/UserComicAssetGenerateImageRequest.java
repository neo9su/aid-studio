package com.aid.asset.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * C端参考资产 AI 补图请求。
 */
@Data
public class UserComicAssetGenerateImageRequest {

    /** 个人或官方资产主键。 */
    @NotNull(message = "资产ID不能为空")
    private Long assetId;

    /** custom / official。 */
    private String sourceFlag;

    /** 允许用户在详情弹窗内修订后提交；为空时使用资产原提示词。 */
    private String prompt;

    /** 可选模型编码；为空时使用该资产类型业务池中的首个可用模型。 */
    private String modelCode;
}
