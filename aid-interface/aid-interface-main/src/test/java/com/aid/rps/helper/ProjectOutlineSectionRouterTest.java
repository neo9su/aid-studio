package com.aid.rps.helper;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ProjectOutlineSectionRouterTest
{
    private final ProjectOutlineSectionRouter router = new ProjectOutlineSectionRouter();

    private static final String OUTLINE = """
            用途：视频生成与后期合成

            ## 一、项目信息
            剧情主线：村庄创业。

            ## 二、角色设定卡
            ### 赵小刚
            18岁以上中国农村青年，服装变体 A、B。

            ### 角色音色设定
            赵小刚：青年男声。

            ## 三、场景标准描述
            | 场景 | 标准描述 |
            | 村屋 | 砖木结构村屋 |

            ## 四、关键道具
            药箱、自行车。

            ## 五、分册文件（全剧）
            | 文件 | 状态 |
            | 01_第001-010章.md | 镜001-084 |
            """;

    @Test
    void routesCharacterSectionsAndDropsFileProgress()
    {
        String result = router.route(OUTLINE, ProjectOutlineSectionRouter.TARGET_CHARACTER);

        assertTrue(result.contains("赵小刚"));
        assertTrue(result.contains("角色音色设定"));
        assertFalse(result.contains("01_第001-010章.md"));
        assertFalse(result.contains("村屋 | 砖木结构村屋"));
    }

    @Test
    void buildsAuthoritativeCharacterManifestAndPutsRoleCardsBeforePlotIndex()
    {
        String outline = """
                ## 一、剧情索引
                很长的剧情索引，提到许多人物。

                ## 二、角色设定卡（Character Design）
                ### 宋雨晴（女主 / 嫂子）
                - 年龄：22岁
                #### 服装细节
                红白格子衬衫。

                ### 孙兰兰
                - 年龄：28岁

                ### 角色音色设定
                宋雨晴：青年女声。
                """;

        var entries = router.extractCharacterEntries(outline);
        assertEquals(2, entries.size());
        assertEquals("宋雨晴", entries.get(0).name());
        assertEquals("孙兰兰", entries.get(1).name());

        String routed = router.route(outline, ProjectOutlineSectionRouter.TARGET_CHARACTER);
        assertTrue(routed.contains("权威清单，必须逐项提取，不得遗漏）：宋雨晴、孙兰兰"));
        assertTrue(routed.indexOf("### 宋雨晴") < routed.indexOf("## 一、剧情索引"));
    }

    @Test
    void routesSceneAndPropSectionsWithoutProductionIndex()
    {
        String result = router.route(OUTLINE, ProjectOutlineSectionRouter.TARGET_SCENE_PROP);

        assertTrue(result.contains("村屋 | 砖木结构村屋"));
        assertTrue(result.contains("药箱、自行车"));
        assertFalse(result.contains("01_第001-010章.md"));
    }

    @Test
    void detectsMinorAgeCombinedWithAdultContent()
    {
        assertTrue(router.containsMinorAdultContent("角色17岁；类型：情色轻喜剧"));
        assertTrue(router.containsMinorAdultContent("角色17–18 岁；类型：A 级片"));
        assertFalse(router.containsMinorAdultContent("角色18岁；类型：成人轻喜剧"));
        assertFalse(router.containsMinorAdultContent("角色17岁；类型：乡村轻喜剧"));
    }

    @Test
    void describesGateThresholdSectionAndLineNumber()
    {
        String outline = """
                ## 一、项目信息
                类型：A 级片
                ## 二、角色设定卡
                ### 赵小刚
                年龄：17–18 岁
                """;

        String result = router.describeMinorAdultContentViolation(outline);

        assertTrue(result.contains("门禁值：0–17岁"));
        assertTrue(result.contains("第5行 [二、角色设定卡 / 赵小刚] 命中“17–18 岁”"));
        assertTrue(result.contains("第2行 [一、项目信息] 命中“A 级片”"));
        assertTrue(result.contains("允许值：明确18岁及以上"));
        assertNull(router.describeMinorAdultContentViolation("角色18岁；类型：A 级片"));
    }
}
