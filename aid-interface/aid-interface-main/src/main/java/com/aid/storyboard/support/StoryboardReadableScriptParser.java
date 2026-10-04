package com.aid.storyboard.support;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 人工分镜可读文本解析器。
 *
 * <p>兼容系统的“字段：值”格式，以及用户常用的 Markdown
 * “- 提示词：`...` / - 台词/旁白：...”格式。解析只补充已知字段，调用方仍应让
 * 已存在的结构化 {@code script_params} 拥有最高优先级。</p>
 */
public final class StoryboardReadableScriptParser {
    private static final Set<String> FIELD_KEYS = Set.copyOf(Arrays.asList(
            "镜号", "场景名称", "场次序号", "批内位置", "剧本内容", "画面描述", "画面说明",
            "台词", "动作状态", "叙事功能", "时间坐标", "年代坐标", "日期坐标", "气候天象",
            "引用信息", "景别", "拍摄角度", "镜头焦距", "镜头运动", "构图", "画面氛围",
            "音效", "备注", "色彩倾向", "光线", "曝光虚化", "镜头组", "镜头组编号",
            "镜头组序号", "时空环境", "镜头模式", "运镜等级", "时长估算", "镜头脚本"));

    private static final Map<String, String> FIELD_ALIASES = Map.ofEntries(
            Map.entry("提示词", "画面描述"),
            Map.entry("画面提示词", "画面描述"),
            Map.entry("视频提示词", "画面描述"),
            Map.entry("台词/旁白", "台词"),
            Map.entry("台词／旁白", "台词"),
            Map.entry("对白/旁白", "台词"),
            Map.entry("对白／旁白", "台词"));

    private static final Pattern SHOT_HEADER = Pattern.compile("^镜\\s*([0-9]+)$");
    private static final Pattern DURATION_SECONDS = Pattern.compile("([0-9]+)\\s*[sS秒]");

    private StoryboardReadableScriptParser() {
    }

    public static LinkedHashMap<String, String> parseFields(String text) {
        LinkedHashMap<String, String> fields = new LinkedHashMap<>();
        if (text == null || text.isBlank()) {
            return fields;
        }
        String currentKey = null;
        StringBuilder currentValue = new StringBuilder();
        for (String rawLine : text.split("\\n", -1)) {
            String line = rawLine.replace("\r", "");
            readShotHeader(line, fields);
            FieldLine fieldLine = matchField(line);
            if (fieldLine != null) {
                flush(fields, currentKey, currentValue);
                currentKey = fieldLine.key();
                currentValue = new StringBuilder(fieldLine.value());
            } else if (currentKey != null && !line.isBlank()) {
                currentValue.append('\n').append(cleanValue(line));
            }
        }
        flush(fields, currentKey, currentValue);
        return fields;
    }

    private static FieldLine matchField(String rawLine) {
        String line = stripListPrefix(rawLine);
        if (line.startsWith("**")) {
            line = line.substring(2).trim();
        }
        int fullColon = line.indexOf('：');
        int halfColon = line.indexOf(':');
        int colon = fullColon < 0 ? halfColon : halfColon < 0 ? fullColon : Math.min(fullColon, halfColon);
        if (colon <= 0) {
            return null;
        }
        String label = line.substring(0, colon).replace("**", "").replace("`", "").trim();
        String key = FIELD_ALIASES.getOrDefault(label, label);
        if (!FIELD_KEYS.contains(key)) {
            return null;
        }
        return new FieldLine(key, cleanValue(line.substring(colon + 1)));
    }

    private static void readShotHeader(String rawLine, LinkedHashMap<String, String> fields) {
        String line = stripListPrefix(rawLine).replace("**", "").replace("`", "").trim();
        String[] parts = line.split("\\s*[｜|]\\s*");
        if (parts.length < 2) {
            return;
        }
        Matcher shot = SHOT_HEADER.matcher(parts[0].trim());
        if (!shot.matches()) {
            return;
        }
        fields.putIfAbsent("镜号", shot.group(1));
        if (parts[1].trim().startsWith("场景")) {
            fields.putIfAbsent("场景名称", parts[1].trim().substring(2).trim());
        }
        if (parts.length > 2 && !parts[2].isBlank()) {
            fields.putIfAbsent("景别", parts[2].trim());
        }
        if (parts.length > 3) {
            Matcher duration = DURATION_SECONDS.matcher(parts[3].trim());
            if (duration.find()) {
                fields.putIfAbsent("时长估算", duration.group(1) + "s");
            }
        }
        if (parts.length > 4 && !parts[4].isBlank()) {
            fields.putIfAbsent("镜头运动", parts[4].trim());
        }
    }

    private static String stripListPrefix(String rawLine) {
        String line = rawLine == null ? "" : rawLine.trim();
        while (line.startsWith("-") || line.startsWith(">") || line.startsWith("*") && !line.startsWith("**")) {
            line = line.substring(1).trim();
        }
        return line;
    }

    private static String cleanValue(String rawValue) {
        String value = rawValue == null ? "" : rawValue.trim();
        if (value.startsWith("**")) {
            value = value.substring(2).trim();
        }
        if (value.endsWith("**") && value.length() >= 2) {
            value = value.substring(0, value.length() - 2).trim();
        }
        if (value.startsWith("`") && value.endsWith("`") && value.length() >= 2) {
            value = value.substring(1, value.length() - 1).trim();
        }
        return value;
    }

    private static void flush(LinkedHashMap<String, String> fields, String key, StringBuilder value) {
        if (key != null) {
            fields.put(key, value.toString().trim());
        }
    }

    private record FieldLine(String key, String value) {
    }
}
