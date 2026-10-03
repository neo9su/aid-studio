package com.aid.rps.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 角色形态图换脸请求DTO（ComfyUI ReActor 图像换脸，作用域=该角色全部形态图）。
 *
 * @author 视觉AID
 */
@Data
public class FaceSwapRoleRequest
{
    /** 资产ID（角色/道具/场景，必填） */
    @NotNull(message = "资产ID不能为空")
    private Long assetId;

    /** 目标人脸图片地址（上传后的 /profile/upload/... 或远程 URL，必填） */
    @NotBlank(message = "目标人脸图片不能为空")
    private String faceImageUrl;
}
