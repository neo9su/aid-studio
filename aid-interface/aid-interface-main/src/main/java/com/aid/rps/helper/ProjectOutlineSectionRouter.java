package com.aid.rps.helper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import cn.hutool.core.util.StrUtil;

/**
 * 按 Markdown 标题把项目总纲裁成资产提取所需上下文，避免把文件清单、镜号进度等误识别为资产。
 */
@Component
public class ProjectOutlineSectionRouter
{
    public static final String TARGET_CHARACTER = "character";
    public static final String TARGET_SCENE = "scene";
    public static final String TARGET_PROP = "prop";
    public static final String TARGET_SCENE_PROP = "scene_prop";

    private static final Pattern HEADING = Pattern.compile("^(#{1,6})\\s+(.+?)\\s*$");
    private static final Pattern MINOR_AGE = Pattern.compile(
            "(?<!\\d)(?:[0-9]|1[0-7])\\s*(?:[-–—~至到]\\s*\\d{1,2}\\s*)?(?:岁|周岁)");
    private static final Pattern ADULT_CONTENT = Pattern.compile(
            "情色|色情|性爱|性行为|行房|初夜|成人内容|A\\s*级片|裸露", Pattern.CASE_INSENSITIVE);
    private static final int MAX_MINOR_LOCATIONS = 12;
    private static final int MAX_ADULT_LOCATIONS = 6;

    private static final Pattern COMMON = Pattern.compile(
            "项目信息|项目设定|剧情主线|剧情索引|故事主线|人物关系|一致性规则|风格指南|style\\s*guide",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHARACTER = Pattern.compile(
            "角色|人物|演员|音色|配音|character", Pattern.CASE_INSENSITIVE);
    private static final Pattern SCENE = Pattern.compile(
            "场景|环境|地点|空间|scene|location", Pattern.CASE_INSENSITIVE);
    private static final Pattern PROP = Pattern.compile(
            "道具|物件|装备|载具|服装|造型|prop|wardrobe", Pattern.CASE_INSENSITIVE);
    private static final Pattern EXCLUDED = Pattern.compile(
            "分册文件|文件清单|完成状态|制作进度|镜号进度|源文件|生成顺序|交付状态",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHARACTER_CONTAINER = Pattern.compile(
            "(?:角色|人物).*(?:设定|设计|档案|清单|小传|卡)|character.*(?:design|profile|list)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_CHARACTER_HEADING = Pattern.compile(
            "角色设定|人物设定|角色设计|人物设计|角色档案|人物档案|角色清单|人物清单|"
                    + "音色|配音|人物关系|角色关系|一致性|规则|说明|索引|总览|汇总",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHARACTER_NAME_SUFFIX = Pattern.compile("\\s*[（(].*?[)）]\\s*$");
    private static final Pattern CHARACTER_NAME_PREFIX = Pattern.compile(
            "^(?:角色|人物)?\\s*(?:[0-9一二三四五六七八九十]+[、.．:：\\-]\\s*)?");

    /**
     * 返回目标资产需要的总纲切片；没有可识别 Markdown 章节时回退全文，兼容普通纯文本总纲。
     */
    public String route(String outline, String target)
    {
        if (StrUtil.isBlank(outline))
        {
            return outline;
        }
        List<Section> sections = parse(outline);
        if (sections.isEmpty())
        {
            return outline;
        }

        String normalizedTarget = StrUtil.blankToDefault(target, "").trim().toLowerCase(Locale.ROOT);
        List<String> targetSections = new ArrayList<>();
        List<String> commonSections = new ArrayList<>();
        boolean hasTargetSpecificSection = false;
        for (Section section : sections)
        {
            String path = section.path();
            if (EXCLUDED.matcher(path).find())
            {
                continue;
            }
            boolean targetSpecific = matchesTarget(path, normalizedTarget);
            if (targetSpecific)
            {
                hasTargetSpecificSection = true;
                targetSections.add(section.content());
            }
            else if (COMMON.matcher(path).find())
            {
                commonSections.add(section.content());
            }
        }
        // 只有无法识别目标章节时才回退全文；如果已有共同上下文，保留共同上下文即可，避免文件表污染。
        if (targetSections.isEmpty() && commonSections.isEmpty())
        {
            return outline;
        }
        String prefix = "【项目总纲定向上下文：仅提取" + targetLabel(normalizedTarget)
                + "；忽略分册文件名、镜号、完成状态和制作说明】\n";
        if (!hasTargetSpecificSection)
        {
            prefix += "【未发现独立目标章节，请仅从共同剧情上下文识别明确出现的资产，不要推测创建】\n";
        }
        if (TARGET_CHARACTER.equals(normalizedTarget))
        {
            List<CharacterOutlineEntry> entries = extractCharacterEntries(outline);
            if (!entries.isEmpty())
            {
                prefix += "【角色标题清单（权威清单，必须逐项提取，不得遗漏）："
                        + String.join("、", entries.stream().map(CharacterOutlineEntry::name).toList())
                        + "】\n";
            }
        }
        // 目标章节必须排在剧情主线/索引等共同上下文之前，确保角色卡不会被长剧情索引挤到后续切片。
        List<String> selected = new ArrayList<>(targetSections.size() + commonSections.size());
        selected.addAll(targetSections);
        selected.addAll(commonSections);
        return prefix + String.join("\n\n", selected).trim();
    }

    /**
     * 从“角色/人物设定”章节的直接子标题建立权威角色清单。标题负责确定角色身份，正文只作为 LLM 补全资料。
     */
    public List<CharacterOutlineEntry> extractCharacterEntries(String outline)
    {
        if (StrUtil.isBlank(outline))
        {
            return List.of();
        }
        Map<String, CharacterOutlineEntry> entries = new LinkedHashMap<>();
        List<Section> sections = parse(outline);
        for (int index = 0; index < sections.size(); index++)
        {
            Section section = sections.get(index);
            if (section.level() < 2 || NON_CHARACTER_HEADING.matcher(section.title()).find())
            {
                continue;
            }
            String parentPath = section.parentPath();
            String immediateParent = parentPath.contains(" / ")
                    ? parentPath.substring(parentPath.lastIndexOf(" / ") + 3) : parentPath;
            if (StrUtil.isBlank(immediateParent) || !CHARACTER_CONTAINER.matcher(immediateParent).find())
            {
                continue;
            }
            String name = normalizeCharacterHeading(section.title());
            if (StrUtil.isBlank(name) || NON_CHARACTER_HEADING.matcher(name).find())
            {
                continue;
            }
            String key = normalizeCharacterKey(name);
            StringBuilder fullContent = new StringBuilder(section.content());
            for (int nestedIndex = index + 1; nestedIndex < sections.size(); nestedIndex++)
            {
                Section nested = sections.get(nestedIndex);
                if (nested.level() <= section.level())
                {
                    break;
                }
                fullContent.append("\n\n").append(nested.content());
            }
            entries.putIfAbsent(key, new CharacterOutlineEntry(name, fullContent.toString()));
        }
        return List.copyOf(entries.values());
    }

    public String normalizeCharacterHeading(String heading)
    {
        if (StrUtil.isBlank(heading))
        {
            return "";
        }
        String name = heading.replace("**", "").replace("`", "").trim();
        name = CHARACTER_NAME_PREFIX.matcher(name).replaceFirst("");
        name = CHARACTER_NAME_SUFFIX.matcher(name).replaceFirst("");
        return name.trim();
    }

    public String normalizeCharacterKey(String name)
    {
        return normalizeCharacterHeading(name)
                .replaceAll("[\\s·•._\\-—–、，,：:]+", "")
                .toLowerCase(Locale.ROOT);
    }

    /** 检测成人内容与未成年人年龄设定是否同时出现。 */
    public boolean containsMinorAdultContent(String outline)
    {
        return inspectMinorAdultContent(outline).blocked();
    }

    /**
     * 返回可直接展示给用户的门禁诊断：阈值、Markdown 章节、行号和触发词都必须明确，
     * 避免只说“包含未成年人”却让用户在长总纲中盲猜。
     */
    public String describeMinorAdultContentViolation(String outline)
    {
        SafetyInspection inspection = inspectMinorAdultContent(outline);
        if (!inspection.blocked())
        {
            return null;
        }
        StringBuilder message = new StringBuilder();
        message.append("项目总纲触发安全门禁：成人内容与未满18岁设定不能同时存在。\n")
                .append("门禁值：0–17岁（含年龄区间下限小于18，如“17–18岁”）；允许值：明确18岁及以上。\n")
                .append("未满18岁命中位置：\n");
        appendLocations(message, inspection.minorLocations(), MAX_MINOR_LOCATIONS, "0–17岁年龄文本");
        message.append("成人内容关键词命中位置：\n");
        appendLocations(message, inspection.adultLocations(), MAX_ADULT_LOCATIONS, "成人内容关键词");
        message.append("修改方式：保留成人内容时，请把上述未满18岁人物设定改为明确的18岁以上；")
                .append("如必须保留未成年人物，则需删除成人内容及相关描写。");
        return message.toString();
    }

    private SafetyInspection inspectMinorAdultContent(String outline)
    {
        if (StrUtil.isBlank(outline))
        {
            return new SafetyInspection(List.of(), List.of());
        }
        List<MatchLocation> minorLocations = new ArrayList<>();
        List<MatchLocation> adultLocations = new ArrayList<>();
        String[] headings = new String[6];
        String[] lines = outline.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1);
        for (int index = 0; index < lines.length; index++)
        {
            String line = lines[index];
            Matcher headingMatcher = HEADING.matcher(line);
            if (headingMatcher.matches())
            {
                int level = headingMatcher.group(1).length();
                headings[level - 1] = headingMatcher.group(2).trim();
                for (int i = level; i < headings.length; i++)
                {
                    headings[i] = null;
                }
            }
            collectMatches(minorLocations, MINOR_AGE.matcher(line), index + 1, headings);
            collectMatches(adultLocations, ADULT_CONTENT.matcher(line), index + 1, headings);
        }
        return new SafetyInspection(List.copyOf(minorLocations), List.copyOf(adultLocations));
    }

    private void collectMatches(List<MatchLocation> result, Matcher matcher, int lineNumber, String[] headings)
    {
        while (matcher.find())
        {
            result.add(new MatchLocation(lineNumber,
                    StrUtil.blankToDefault(joinPath(headings), "文档开头"), matcher.group()));
        }
    }

    private void appendLocations(StringBuilder message, List<MatchLocation> locations, int limit,
            String kindLabel)
    {
        int shown = Math.min(locations.size(), limit);
        for (int i = 0; i < shown; i++)
        {
            MatchLocation location = locations.get(i);
            message.append("- 第").append(location.lineNumber()).append("行 [")
                    .append(location.section()).append("] 命中“")
                    .append(location.matchedText()).append("”\n");
        }
        if (locations.size() > shown)
        {
            message.append("- 另有 ").append(locations.size() - shown)
                    .append(" 处同类命中，请继续搜索").append(kindLabel).append("。\n");
        }
    }

    private boolean matchesTarget(String path, String target)
    {
        return switch (target)
        {
            case TARGET_CHARACTER -> CHARACTER.matcher(path).find();
            case TARGET_SCENE -> SCENE.matcher(path).find();
            case TARGET_PROP -> PROP.matcher(path).find();
            case TARGET_SCENE_PROP -> SCENE.matcher(path).find() || PROP.matcher(path).find();
            default -> false;
        };
    }

    private String targetLabel(String target)
    {
        return switch (target)
        {
            case TARGET_CHARACTER -> "角色、形态与音色设定";
            case TARGET_SCENE -> "场景与环境设定";
            case TARGET_PROP -> "关键道具设定";
            case TARGET_SCENE_PROP -> "场景与关键道具设定";
            default -> "明确资产";
        };
    }

    private List<Section> parse(String outline)
    {
        List<Section> sections = new ArrayList<>();
        String[] headings = new String[6];
        StringBuilder current = null;
        String currentPath = null;
        int currentLevel = 0;
        String currentTitle = null;
        for (String line : outline.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1))
        {
            Matcher matcher = HEADING.matcher(line);
            if (matcher.matches())
            {
                if (current != null && StrUtil.isNotBlank(current))
                {
                    sections.add(new Section(currentLevel, currentTitle, currentPath,
                            parentPath(currentPath, currentTitle), current.toString().trim()));
                }
                int level = matcher.group(1).length();
                headings[level - 1] = matcher.group(2).trim();
                for (int i = level; i < headings.length; i++)
                {
                    headings[i] = null;
                }
                currentPath = joinPath(headings);
                current = new StringBuilder(line);
                currentLevel = level;
                currentTitle = matcher.group(2).trim();
            }
            else if (current != null)
            {
                current.append('\n').append(line);
            }
        }
        if (current != null && StrUtil.isNotBlank(current))
        {
            sections.add(new Section(currentLevel, currentTitle, currentPath,
                    parentPath(currentPath, currentTitle), current.toString().trim()));
        }
        return sections;
    }

    private String parentPath(String path, String title)
    {
        if (StrUtil.isBlank(path) || StrUtil.isBlank(title))
        {
            return "";
        }
        String suffix = " / " + title;
        if (path.endsWith(suffix))
        {
            return path.substring(0, path.length() - suffix.length());
        }
        return path.equals(title) ? "" : path;
    }

    private String joinPath(String[] headings)
    {
        List<String> path = new ArrayList<>();
        for (String heading : headings)
        {
            if (StrUtil.isNotBlank(heading))
            {
                path.add(heading);
            }
        }
        return String.join(" / ", path);
    }

    public record CharacterOutlineEntry(String name, String content) { }

    private record Section(int level, String title, String path, String parentPath, String content) { }

    private record MatchLocation(int lineNumber, String section, String matchedText) { }

    private record SafetyInspection(List<MatchLocation> minorLocations, List<MatchLocation> adultLocations)
    {
        private boolean blocked()
        {
            return !minorLocations.isEmpty() && !adultLocations.isEmpty();
        }
    }
}
