package com.aid.rps.helper;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Component;

import com.aid.aid.domain.AidRolePropScene;
import com.aid.common.exception.ServiceException;
import com.aid.rps.helper.StoryboardScriptCoveragePlanner.CoverageBatch;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import cn.hutool.core.collection.CollectionUtil;
import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * 解析分镜智能体的场次包装并绑定项目内场景资产。
 *
 * @author 视觉AID
 */
@Slf4j
@Component
public class StoryboardSceneEnvelopeParser
{
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private static final String PROFESSIONAL_DIRECT_OUTPUT_CONTRACT = """

            【当前直驱分镜接口输出契约（最高优先级，替代上文所有旧输出格式）】
            最终响应只能是合法 JSON object，根键只能是 scenes，不得输出 Markdown 或解释。
            格式必须为：
            {"scenes":[{"sceneName":"必须逐字使用可用场景资产名","shots":[{"content":["镜头组：...","剧本内容：...","画面说明：...","台词：...","时空环境：...","引用信息：...","镜头模式：...","运镜等级：...","时长估算：...","镜头脚本：..."]}]}]}
            scenes 按剧情顺序排列；每个场次对象只能包含 sceneName、shots 两个字段。
            每个 shots 元素只能包含 content 一个字段；content 必须恰好包含上述 10 个固定字段字符串且顺序不变。
            剧本内容必须逐字、保序覆盖当前有效剧情正文，不得输出数据库 ID。
            """;

    /**
     * 专业版智能体的历史提示词使用 {@code {"content": [...]}} 单镜头组契约；直驱链路需要
     * 按场次包装后才能绑定场景资产。将当前接口契约追加到同一个 system 消息末尾，明确覆盖旧契约。
     */
    public String enforceDirectOutputContract(String systemPrompt, boolean writerOutput)
    {
        if (!writerOutput)
        {
            return systemPrompt;
        }
        return StrUtil.nullToEmpty(systemPrompt) + PROFESSIONAL_DIRECT_OUTPUT_CONTRACT;
    }

    /**
     * 解析模型输出并按原始数组顺序返回场次。
     *
     * @param llmOutput 模型原始输出
     * @param sceneAssets 当前项目和用户可用的场景资产
     * @param writerOutput 是否为专业版镜头结构
     * @return 已绑定场景资产的有序场次列表
     */
    public List<SceneEnvelope> parse(String llmOutput, List<AidRolePropScene> sceneAssets,
                                     boolean writerOutput)
    {
        return parseStructure(llmOutput, sceneAssets, writerOutput, false);
    }

    private List<SceneEnvelope> parseStructure(String llmOutput, List<AidRolePropScene> sceneAssets,
                                               boolean writerOutput, boolean allowEmptyScenes)
    {
        if (StrUtil.isBlank(llmOutput) || CollectionUtil.isEmpty(sceneAssets))
        {
            log.error("分镜场次解析输入为空: outputBlank={}, sceneCount={}",
                    StrUtil.isBlank(llmOutput), CollectionUtil.isEmpty(sceneAssets) ? 0 : sceneAssets.size());
            throw new ServiceException("分镜数据异常");
        }

        Map<String, AidRolePropScene> sceneIndex = buildSceneIndex(sceneAssets);
        JsonNode root = readRootObject(llmOutput);
        if (root.size() != 1 || !root.has("scenes") || !root.get("scenes").isArray()
                || (!allowEmptyScenes && root.get("scenes").isEmpty()))
        {
            log.error("分镜场次根结构异常: fields={}", root.fieldNames());
            throw new ServiceException("模型格式异常");
        }

        List<SceneEnvelope> result = new ArrayList<>();
        for (JsonNode sceneNode : root.get("scenes"))
        {
            if (!sceneNode.isObject() || sceneNode.size() != 2
                    || !sceneNode.has("sceneName") || !sceneNode.has("shots"))
            {
                log.error("分镜场次字段异常: fields={}", sceneNode.fieldNames());
                throw new ServiceException("模型格式异常");
            }
            String sceneName = StrUtil.trim(sceneNode.path("sceneName").asText(""));
            AidRolePropScene scene = sceneIndex.get(normalizeSceneName(sceneName));
            if (Objects.isNull(scene))
            {
                log.error("分镜场景名称未匹配: sceneName={}", sceneName);
                throw new ServiceException("场景名称未匹配");
            }
            JsonNode shotsNode = sceneNode.get("shots");
            if (Objects.isNull(shotsNode) || !shotsNode.isArray() || shotsNode.isEmpty())
            {
                log.error("分镜场次缺少镜头: sceneName={}", sceneName);
                throw new ServiceException("模型格式异常");
            }

            List<JsonNode> shots = new ArrayList<>();
            List<String> plotParts = new ArrayList<>();
            for (JsonNode shotNode : shotsNode)
            {
                if (!shotNode.isObject())
                {
                    log.error("分镜镜头节点不是对象: sceneName={}", sceneName);
                    throw new ServiceException("模型格式异常");
                }
                Map<String, String> writerFields = Map.of();
                if (writerOutput)
                {
                    writerFields = StoryboardWriterContentParser.parse(shotNode.get("content"));
                    if (shotNode.size() != 1 || writerFields.size()
                            != StoryboardWriterContentParser.requiredFields().size())
                    {
                        log.error("专业版分镜字段异常: sceneName={}, fields={}",
                                sceneName, shotNode.fieldNames());
                        throw new ServiceException("模型格式异常");
                    }
                }
                shots.add(shotNode);
                String plotPart = writerOutput
                        ? writerFields.getOrDefault("剧本内容", "")
                        : StrUtil.trim(shotNode.path("scriptContent").asText(""));
                if (StrUtil.isNotBlank(plotPart))
                {
                    plotParts.add(plotPart);
                }
            }
            if (plotParts.isEmpty())
            {
                log.error("分镜场次缺少剧本内容: sceneName={}", sceneName);
                throw new ServiceException("剧本内容缺失");
            }
            String plotContent = String.join("\n", plotParts);
            if (!allowEmptyScenes && !result.isEmpty()
                    && Objects.equals(result.get(result.size() - 1).scene().getId(), scene.getId()))
            {
                SceneEnvelope previous = result.remove(result.size() - 1);
                List<JsonNode> mergedShots = new ArrayList<>(previous.shots());
                mergedShots.addAll(shots);
                result.add(new SceneEnvelope(previous.scene(), previous.sceneName(), mergedShots,
                        previous.plotContent() + "\n" + plotContent));
            }
            else
            {
                result.add(new SceneEnvelope(scene, sceneName, shots, plotContent));
            }
        }
        return result;
    }

    /**
     * 解析并校验所有镜头剧本内容对当前剧本片段的保序完整覆盖。
     *
     * @param llmOutput 模型原始输出
     * @param sceneAssets 当前项目和用户可用的场景资产
     * @param writerOutput 是否为专业版镜头结构
     * @param expectedScript 当前剧本片段
     * @return 已绑定并校验的场次列表
     */
    public List<SceneEnvelope> parse(String llmOutput, List<AidRolePropScene> sceneAssets,
                                     boolean writerOutput, String expectedScript)
    {
        return parse(llmOutput, sceneAssets, writerOutput, expectedScript, false);
    }

    /**
     * 解析模型输出并按任务范围校验剧本覆盖。
     *
     * @param llmOutput 模型原始输出
     * @param sceneAssets 当前项目和用户可用的场景资产
     * @param writerOutput 是否为专业版镜头结构
     * @param expectedScript 当前剧本片段
     * @param allowPartialCoverage 是否允许跳过未选场景原文
     * @return 已绑定并校验的场次列表
     */
    public List<SceneEnvelope> parse(String llmOutput, List<AidRolePropScene> sceneAssets,
                                     boolean writerOutput, String expectedScript,
                                     boolean allowPartialCoverage)
    {
        CoverageBatch legacyBatch = new CoverageBatch(0, expectedScript, "",
                List.of(), List.of(), StrUtil.length(expectedScript));
        return parse(llmOutput, sceneAssets, writerOutput, legacyBatch, allowPartialCoverage);
    }

    /**
     * 解析模型输出并按有效正文和显式视觉指令校验当前批次。
     *
     * @param llmOutput 模型原始输出
     * @param sceneAssets 当前项目和用户可用的场景资产
     * @param writerOutput 是否为专业版镜头结构
     * @param expectedBatch 当前有效正文覆盖批次
     * @param allowPartialCoverage 是否允许跳过未选场景原文
     * @return 已绑定并校验的场次列表
     */
    public List<SceneEnvelope> parse(String llmOutput, List<AidRolePropScene> sceneAssets,
                                     boolean writerOutput, CoverageBatch expectedBatch,
                                     boolean allowPartialCoverage)
    {
        List<SceneEnvelope> result = parseStructure(
                llmOutput, sceneAssets, writerOutput, allowPartialCoverage);
        if (allowPartialCoverage && result.isEmpty())
        {
            return result;
        }
        StoryboardVisualDirectiveValidator.validate(
                result, expectedBatch, writerOutput, allowPartialCoverage);
        return result;
    }

    private Map<String, AidRolePropScene> buildSceneIndex(List<AidRolePropScene> sceneAssets)
    {
        Map<String, AidRolePropScene> result = new LinkedHashMap<>();
        for (AidRolePropScene scene : sceneAssets)
        {
            if (Objects.isNull(scene) || Objects.isNull(scene.getId()) || StrUtil.isBlank(scene.getName()))
            {
                continue;
            }
            String key = normalizeSceneName(scene.getName());
            AidRolePropScene previous = result.putIfAbsent(key, scene);
            if (Objects.nonNull(previous) && !Objects.equals(previous.getId(), scene.getId()))
            {
                log.error("场景规范名冲突: firstId={}, secondId={}, name={}",
                        previous.getId(), scene.getId(), scene.getName());
                throw new ServiceException("场景名称冲突");
            }
        }
        return result;
    }

    private JsonNode readRootObject(String llmOutput)
    {
        String text = stripCodeFence(llmOutput);
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end < start)
        {
            log.error("分镜场次输出缺少对象根");
            throw new ServiceException("模型格式异常");
        }
        try
        {
            String rootText = text.substring(start, end + 1);
            JsonNode root = OBJECT_MAPPER.readTree(rootText);
            if (!root.isObject())
            {
                throw new ServiceException("模型格式异常");
            }
            return root;
        }
        catch (ServiceException e)
        {
            throw e;
        }
        catch (Exception e)
        {
            log.error("分镜场次JSON解析失败", e);
            throw new ServiceException("模型格式异常");
        }
    }

    private String stripCodeFence(String value)
    {
        String text = StrUtil.trim(value);
        if (!text.startsWith("```"))
        {
            return text;
        }
        int firstBreak = text.indexOf('\n');
        int closing = text.lastIndexOf("```");
        if (firstBreak >= 0 && closing > firstBreak)
        {
            return text.substring(firstBreak + 1, closing).trim();
        }
        return text;
    }

    private String normalizeSceneName(String value)
    {
        if (StrUtil.isBlank(value))
        {
            return "";
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC).trim();
        return normalized.replaceAll("\\s+", "");
    }

    /**
     * 场次包装解析结果。
     */
    public record SceneEnvelope(AidRolePropScene scene, String sceneName,
                                List<JsonNode> shots, String plotContent)
    {
    }
}
