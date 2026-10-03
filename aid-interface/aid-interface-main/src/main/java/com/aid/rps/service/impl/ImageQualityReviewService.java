package com.aid.rps.service.impl;

import com.aid.core.service.ISysConfigService;
import com.aid.media.dto.MediaTaskResponse;
import com.aid.media.dto.MediaTextGenerateRequest;
import com.aid.media.service.IMediaGenerationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 形态图质量审核门。
 *
 * <p>出图后、落库前调用：用 VLM 对照该形态的规格描述（prompt）判断生成图是否
 * 【明确符合】要求。合格 → 放行；不合格 → 由调用方（doExecuteSingleFormImage）重做。
 *
 * <p>设计要点：
 * <ul>
 *   <li>审核调用 {@code billingExempt=true}（内部质检，不向用户扣费）。</li>
 *   <li>fail-safe：VLM 未启用/超时/报错/输出为空 → 按「合格」放行，绝不阻塞出图。</li>
 *   <li>判定阈值：只有「明确违反」规格（年龄感明显跑偏、关键元素缺失、视图不全、
 *       五官畸形、背景错误等）才判不合格；风格/细节轻微差异不算。</li>
 *   <li>开关与参数走 sys_config（admin 可配），缺失时用默认值。</li>
 * </ul>
 */
@Slf4j
@Service
public class ImageQualityReviewService {

    public static final String CFG_ENABLED = "aid.image_review.enabled";
    public static final String CFG_MAX_ATTEMPTS = "aid.image_review.max_attempts";
    public static final String CFG_MODEL = "aid.image_review.model";

    private static final String DEFAULT_MODEL = "gemini-3.5-flash";
    private static final int DEFAULT_MAX_ATTEMPTS = 3;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private IMediaGenerationService mediaGenerationService;

    @Autowired
    private ISysConfigService sysConfigService;

    /** 审核结论。 */
    public static class ReviewResult {
        /** 是否合格（true 放行）。 */
        public final boolean pass;
        /** 是否真正经过 VLM 判定（false = 未启用/异常，fail-safe 放行）。 */
        public final boolean reviewed;
        /** 一句话说明（不合格时点明具体问题）。 */
        public final String reason;

        public ReviewResult(boolean pass, boolean reviewed, String reason) {
            this.pass = pass;
            this.reviewed = reviewed;
            this.reason = reason;
        }

        public static ReviewResult passNoReview() {
            return new ReviewResult(true, false, "未启用审核");
        }

        public static ReviewResult pass(String reason) {
            return new ReviewResult(true, true, reason);
        }

        public static ReviewResult fail(String reason) {
            return new ReviewResult(false, true, reason);
        }
    }

    /** 审核门是否启用。 */
    public boolean isEnabled() {
        return "true".equalsIgnoreCase(config(CFG_ENABLED, "true"));
    }

    /** 最大尝试次数（含首次），钳制在 [1,5]。 */
    public int maxAttempts() {
        int v = parseInt(config(CFG_MAX_ATTEMPTS, String.valueOf(DEFAULT_MAX_ATTEMPTS)), DEFAULT_MAX_ATTEMPTS);
        return Math.max(1, Math.min(5, v));
    }

    /**
     * 审核一张生成图是否明确符合规格。
     *
     * @param imageUrl  生成图 URL（平台 OSS/CDN）
     * @param prompt    该形态的规格描述（最终 prompt）
     * @param assetType character / scene / prop
     * @param userId    发起用户（计费上下文，审核免费但仍需透传）
     */
    public ReviewResult review(String imageUrl, String prompt, String assetType, Long userId) {
        if (!isEnabled()) {
            return ReviewResult.passNoReview();
        }
        String model = config(CFG_MODEL, DEFAULT_MODEL);
        String reviewPrompt = buildReviewPrompt(prompt, assetType);
        // 防御：VLM 需要可直接拉取的绝对 URL（http/https/gs）。相对路径（平台 OSS 相对地址）
        // 会让能力校验器在 scheme 判空时 NPE，这里提前按「合格放行」兜底并留痕。
        if (imageUrl == null || imageUrl.isBlank()
                || !(imageUrl.startsWith("http://") || imageUrl.startsWith("https://") || imageUrl.startsWith("gs:"))) {
            log.warn("图像审核：URL 非绝对地址，按合格放行: {}", imageUrl);
            return new ReviewResult(true, false, "URL 非绝对地址(按合格放行): " + imageUrl);
        }
        try {
            MediaTextGenerateRequest req = new MediaTextGenerateRequest();
            req.setModelName(model);
            req.setBillingExempt(true);
            req.setUserId(userId);

            MediaTextGenerateRequest.TextMessageItem msg = new MediaTextGenerateRequest.TextMessageItem();
            msg.setRole("user");
            List<MediaTextGenerateRequest.TextContentPart> parts = new ArrayList<>();
            MediaTextGenerateRequest.TextContentPart img = new MediaTextGenerateRequest.TextContentPart();
            img.setType("image");
            img.setUrl(imageUrl);
            img.setMimeType("image/png");
            parts.add(img);
            MediaTextGenerateRequest.TextContentPart txt = new MediaTextGenerateRequest.TextContentPart();
            txt.setType("text");
            txt.setText(reviewPrompt);
            parts.add(txt);
            msg.setParts(parts);
            req.setMessages(List.of(msg));

            MediaTaskResponse resp = mediaGenerationService.generateText(req);
            if (resp == null || !"SUCCEEDED".equalsIgnoreCase(resp.getStatus())) {
                String err = resp == null ? "无响应" : String.valueOf(resp.getErrorMessage());
                log.warn("图像审核 VLM 未成功，按合格放行: model={}, err={}", model, err);
                return new ReviewResult(true, false, "审核未成功(按合格放行): " + err);
            }
            return parseReview(resp.getTextContent());
        } catch (Exception e) {
            log.warn("图像审核异常，按合格放行: {}", e.getMessage());
            return new ReviewResult(true, false, "审核异常(按合格放行): " + e.getMessage());
        }
    }

    /** 解析 VLM 输出（JSON {pass, reason}；非 JSON 时按「不合格」关键词兜底）。 */
    private ReviewResult parseReview(String text) {
        if (text == null || text.isBlank()) {
            return new ReviewResult(true, false, "审核输出为空(按合格放行)");
        }
        try {
            int s = text.indexOf('{');
            int e = text.lastIndexOf('}');
            String json = (s >= 0 && e > s) ? text.substring(s, e + 1) : text;
            JsonNode node = OBJECT_MAPPER.readTree(json);
            boolean pass;
            if (node.has("pass")) {
                pass = node.get("pass").asBoolean();
            } else if (node.has("合格")) {
                pass = node.get("合格").asBoolean();
            } else {
                pass = true;
            }
            String reason;
            if (node.has("reason")) {
                reason = node.get("reason").asText();
            } else if (node.has("原因")) {
                reason = node.get("原因").asText();
            } else {
                reason = "";
            }
            return pass ? ReviewResult.pass(reason) : ReviewResult.fail(reason);
        } catch (Exception e) {
            boolean fail = text.contains("不合格") || text.contains("不符合")
                    || text.contains("FAIL") || text.contains("fail");
            return fail ? ReviewResult.fail(text.trim()) : ReviewResult.pass(text.trim());
        }
    }

    /** 类型化审核指令：给出明确判定标准 + 规格描述 + 严格 JSON 输出契约。 */
    private String buildReviewPrompt(String prompt, String assetType) {
        String base = "你是图像质检员。下面给你一张生成图，以及它应当满足的规格描述。请严格判断这张图是否【明确符合】规格。\n";
        String dims;
        if ("character".equalsIgnoreCase(assetType)) {
            dims = "检查维度：1) 人物身份/年龄感/五官/发型是否与描述一致（年龄感明显跑偏算不合格，例如设定 27 岁却出来像 40 多）；"
                    + "2) 服装/配饰是否与描述一致；"
                    + "3) 是否完整呈现所需视图（如三视图/全身/面部）；"
                    + "4) 五官是否端正、有无明显畸形（眼睛歪斜、多余肢体、比例失调）；"
                    + "5) 背景/构图是否符合要求（如纯白背景、无多余人物/文字）。";
        } else if ("scene".equalsIgnoreCase(assetType)) {
            dims = "检查维度：1) 场景地点/时代氛围/核心元素是否与描述一致；"
                    + "2) 是否完整呈现所需视图（如四宫格各角度，且角度彼此区分）；"
                    + "3) 光影/材质/细节是否到位；"
                    + "4) 有无明显穿帮（错误文字、多余人物、结构错乱）。";
        } else {
            dims = "检查维度：主体/关键细节/构图是否与描述一致，有无明显穿帮或畸形。";
        }
        return base + dims
                + "\n判定标准：只有【明确违反】上述规格（年龄感明显跑偏、关键元素缺失、视图不全、五官畸形、背景错误等）才判不合格；"
                + "风格、光线、细节上的轻微差异不算不合格。\n"
                + "规格描述：\n" + (prompt == null ? "" : prompt)
                + "\n只输出 JSON，不要多余文字：{\"pass\": true|false, \"reason\": \"<一句话说明；不合格时点明具体问题>\"}";
    }

    private String config(String key, String def) {
        try {
            String v = sysConfigService.selectConfigByKey(key);
            return (v == null || v.isBlank()) ? def : v.trim();
        } catch (Exception e) {
            return def;
        }
    }

    private int parseInt(String s, int def) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return def;
        }
    }
}
