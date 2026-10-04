package com.aid.media.provider;

import cn.hutool.core.util.StrUtil;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Agnes 2.5 提示词结构适配器。
 *
 * <p>将内部结构化三段式提示词（# 主题 / # 运镜 / # 风格）合并为
 * 一段自然语言描述，适配 Agnes Video 2.5 的 prompt 输入偏好。
 * 保留 {@code <Picture N>} / {@code <Video N>} / {@code <Audio N>} 引用标记不变。</p>
 *
 * <p>若输入已经是自然语言（无三段结构），原样返回。</p>
 */
public final class Agnes25PromptAdapter {

    /** 匹配三段式标题行（允许 # 后有多余空格）。 */
    private static final Pattern SECTION_HEADER = Pattern.compile(
            "^\\s*#\\s*(主题|运镜|风格)\\s*$", Pattern.MULTILINE);

    /** 检测是否包含至少两个三段标题。 */
    private static final Pattern HAS_STRUCTURE = Pattern.compile(
            "^\\s*#\\s*(主题|运镜|风格)\\s*$", Pattern.MULTILINE);

    private Agnes25PromptAdapter() {
    }

    /**
     * 将结构化三段式提示词转换为自然语言段落。
     *
     * @param prompt 经过 {@link ReferencePromptSanitizer#sanitizeForAgnes25} 清洗后的提示词
     * @return 自然语言段落；若输入无三段结构则原样返回
     */
    public static String reformatToNatural(String prompt) {
        if (StrUtil.isBlank(prompt)) {
            return prompt;
        }
        // 快速检测：至少两个 section header 才认为有结构
        int headerCount = countMatches(HAS_STRUCTURE, prompt);
        if (headerCount < 2) {
            return prompt;
        }
        List<String> parts = parseSections(prompt);
        if (parts.size() < 2) {
            return prompt;
        }
        // 合并为一段自然语言
        StringBuilder sb = new StringBuilder(prompt.length());
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) {
                sb.append(' ');
            }
            sb.append(parts.get(i));
        }
        return sb.toString().strip();
    }

    /** 解析三段结构，返回各段内容（已 trim）。 */
    private static List<String> parseSections(String prompt) {
        List<String> parts = new ArrayList<>(4);
        Matcher m = SECTION_HEADER.matcher(prompt);
        int lastEnd = 0;
        while (m.find()) {
            // 上一段内容 = lastEnd 到当前 header 开始
            if (lastEnd > 0) {
                String content = prompt.substring(lastEnd, m.start()).trim();
                if (!content.isEmpty()) {
                    parts.add(content);
                }
            }
            // 如果第一个 header 前有内容（非标题的开头），也加入
            if (parts.isEmpty() && m.start() > 0) {
                String preamble = prompt.substring(0, m.start()).trim();
                if (!preamble.isEmpty()) {
                    parts.add(preamble);
                }
            }
            lastEnd = m.end();
        }
        // 最后一段
        if (lastEnd < prompt.length()) {
            String content = prompt.substring(lastEnd).trim();
            if (!content.isEmpty()) {
                parts.add(content);
            }
        }
        return parts;
    }

    private static int countMatches(Pattern pattern, String input) {
        Matcher m = pattern.matcher(input);
        int count = 0;
        while (m.find()) {
            count++;
        }
        return count;
    }
}
