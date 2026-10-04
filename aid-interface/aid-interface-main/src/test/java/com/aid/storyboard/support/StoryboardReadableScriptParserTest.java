package com.aid.storyboard.support;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class StoryboardReadableScriptParserTest {
    @Test
    void parsesManualMarkdownStoryboard() {
        String text = """
                **镜 002 ｜ 场景S1 ｜ 中景 ｜ 8s ｜ 跟拍**

                - 提示词：`17岁中国农村青年赶着羊群沿村道回家，电影质感`
                - 台词/旁白：（旁白）\"赵小刚提早赶着羊群回家。\"
                - 音效：羊群咩咩、脚步声、蝉鸣
                - 备注：男主首次出场。
                """;

        Map<String, String> fields = StoryboardReadableScriptParser.parseFields(text);

        assertEquals("002", fields.get("镜号"));
        assertEquals("S1", fields.get("场景名称"));
        assertEquals("中景", fields.get("景别"));
        assertEquals("8s", fields.get("时长估算"));
        assertEquals("跟拍", fields.get("镜头运动"));
        assertEquals("17岁中国农村青年赶着羊群沿村道回家，电影质感", fields.get("画面描述"));
        assertEquals("（旁白）\"赵小刚提早赶着羊群回家。\"", fields.get("台词"));
        assertEquals("羊群咩咩、脚步声、蝉鸣", fields.get("音效"));
        assertEquals("男主首次出场。", fields.get("备注"));
    }

    @Test
    void parsesCanonicalMultilineField() {
        String text = "画面说明：室内晨光\n人物缓慢走向窗边\n台词：早上好";

        Map<String, String> fields = StoryboardReadableScriptParser.parseFields(text);

        assertEquals("室内晨光\n人物缓慢走向窗边", fields.get("画面说明"));
        assertEquals("早上好", fields.get("台词"));
    }
}
