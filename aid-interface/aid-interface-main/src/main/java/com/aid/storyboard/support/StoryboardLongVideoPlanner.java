package com.aid.storyboard.support;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.aid.common.exception.ServiceException;
import com.aid.domain.vo.AiModelConfigVo;

import cn.hutool.core.util.StrUtil;

/** Plans a user-visible long shot as provider-sized, time-labelled segments. */
public final class StoryboardLongVideoPlanner
{
    public static final int MAX_TOTAL_SECONDS = 24;
    public static final int MIN_SEGMENT_SECONDS = 4;

    private static final Pattern EXPLICIT_SCENE = Pattern.compile(
            "(?ms)(?:^|\\n)\\s*(?:#{1,3}\\s*)?(第[一二三四五六七八九十0-9]+(?:幕|段|镜)|镜头\\s*[0-9]+)"
                    + "\\s*[:：-]?\\s*(?:\\(|（)?\\s*([0-9]{1,2})\\s*(?:秒|s)\\s*(?:\\)|）)?\\s*[:：-]?\\s*"
                    + "(.*?)(?=(?:\\n\\s*(?:#{1,3}\\s*)?(?:第[一二三四五六七八九十0-9]+(?:幕|段|镜)|镜头\\s*[0-9]+)"
                    + "\\s*[:：-]?\\s*(?:\\(|（)?\\s*[0-9]{1,2}\\s*(?:秒|s))|\\z)");

    private StoryboardLongVideoPlanner()
    {
    }

    public static boolean supports(AiModelConfigVo model)
    {
        if (model == null)
        {
            return false;
        }
        String provider = StrUtil.trimToEmpty(model.getProviderCode()).toLowerCase(Locale.ROOT);
        String code = StrUtil.trimToEmpty(model.getModelCode()).toLowerCase(Locale.ROOT);
        return "agnes".equals(provider) || "minimax".equals(provider)
                || code.contains("agnes-video-2.5") || code.contains("minimax-h3");
    }

    public static int providerSegmentLimit(AiModelConfigVo model)
    {
        String provider = model == null ? "" : StrUtil.trimToEmpty(model.getProviderCode()).toLowerCase(Locale.ROOT);
        String code = model == null ? "" : StrUtil.trimToEmpty(model.getModelCode()).toLowerCase(Locale.ROOT);
        if ("agnes".equals(provider) || code.contains("agnes-video-2.5"))
        {
            return 12;
        }
        // The local RTX 3090 adapter is intentionally capped at ten seconds.
        String baseUrl = model == null ? "" : StrUtil.trimToEmpty(model.getBaseUrl()).toLowerCase(Locale.ROOT);
        if (("minimax".equals(provider) || code.contains("minimax-h3"))
                && (baseUrl.contains("127.0.0.1:19090") || baseUrl.contains("localhost:19090")))
        {
            return 10;
        }
        return 15;
    }

    public static List<Segment> plan(String prompt, Integer requestedSeconds, AiModelConfigVo model)
    {
        int total = requestedSeconds == null ? 0 : requestedSeconds;
        if (total <= 0)
        {
            return List.of(new Segment(0, 1, requestedSeconds, prompt, false));
        }
        if (total > MAX_TOTAL_SECONDS)
        {
            throw new ServiceException("视频时长最多24秒");
        }
        int limit = providerSegmentLimit(model);
        if (total <= limit)
        {
            return List.of(new Segment(0, 1, total, prompt, false));
        }
        if (!supports(model))
        {
            throw new ServiceException("视频时长不支持");
        }

        List<ExplicitPart> explicit = parseExplicit(prompt);
        if (isUsableExplicitPlan(explicit, total, limit))
        {
            List<Segment> result = new ArrayList<>(explicit.size());
            for (int index = 0; index < explicit.size(); index++)
            {
                ExplicitPart part = explicit.get(index);
                result.add(new Segment(index, explicit.size(), part.seconds(),
                        labelPrompt(part.text(), index, explicit.size(), part.seconds()), true));
            }
            return result;
        }

        int count = (int) Math.ceil(total / (double) limit);
        int base = total / count;
        int remainder = total % count;
        List<Segment> result = new ArrayList<>(count);
        for (int index = 0; index < count; index++)
        {
            int seconds = base + (index < remainder ? 1 : 0);
            result.add(new Segment(index, count, seconds,
                    labelPrompt(prompt, index, count, seconds), false));
        }
        return result;
    }

    private static List<ExplicitPart> parseExplicit(String prompt)
    {
        List<ExplicitPart> result = new ArrayList<>();
        Matcher matcher = EXPLICIT_SCENE.matcher(StrUtil.blankToDefault(prompt, ""));
        while (matcher.find())
        {
            int seconds;
            try
            {
                seconds = Integer.parseInt(matcher.group(2));
            }
            catch (NumberFormatException ignored)
            {
                continue;
            }
            String text = StrUtil.trimToEmpty(matcher.group(3));
            result.add(new ExplicitPart(seconds,
                    StrUtil.isBlank(text) ? matcher.group(1) : matcher.group(1) + "：" + text));
        }
        return result;
    }

    private static boolean isUsableExplicitPlan(List<ExplicitPart> parts, int total, int limit)
    {
        if (parts.size() < 2)
        {
            return false;
        }
        int sum = 0;
        for (ExplicitPart part : parts)
        {
            if (part.seconds() < MIN_SEGMENT_SECONDS || part.seconds() > limit)
            {
                return false;
            }
            sum += part.seconds();
        }
        return sum == total;
    }

    private static String labelPrompt(String prompt, int index, int count, int seconds)
    {
        return "【自动分段 " + (index + 1) + "/" + count + "｜本段 " + seconds + " 秒】\n"
                + "只生成本段内容；本段末尾动作自然收住，保持人物、服装、场景、光线与相邻片段连续。\n"
                + StrUtil.trimToEmpty(prompt);
    }

    private record ExplicitPart(int seconds, String text)
    {
    }

    public record Segment(int index, int count, Integer seconds, String prompt, boolean explicit)
    {
        public boolean split()
        {
            return count > 1;
        }
    }
}
