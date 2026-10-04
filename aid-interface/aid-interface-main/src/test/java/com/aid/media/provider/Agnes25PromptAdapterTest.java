package com.aid.media.provider;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Agnes25PromptAdapterTest {

    @Test
    void mergesThreeSectionsToNaturalParagraph() {
        String input = "# 主题\n" +
                "一位年轻女子站在金色麦田中，微风吹动她的长发\n\n" +
                "# 运镜\n" +
                "镜头从背后缓慢向前推进，逐渐接近她的侧脸\n\n" +
                "# 风格\n" +
                "电影感，暖色调，金色夕阳，浅景深，胶片颗粒";

        String result = Agnes25PromptAdapter.reformatToNatural(input);

        assertEquals(
                "一位年轻女子站在金色麦田中，微风吹动她的长发 镜头从背后缓慢向前推进，逐渐接近她的侧脸 电影感，暖色调，金色夕阳，浅景深，胶片颗粒",
                result);
    }

    @Test
    void preservesPictureReferences() {
        String input = "# 主题\n" +
                "<Picture 1> 在河边洗衣裳，阳光照在水面上\n\n" +
                "# 运镜\n" +
                "俯拍镜头缓慢下降至水面\n\n" +
                "# 风格\n" +
                "自然光，纪实风格";

        String result = Agnes25PromptAdapter.reformatToNatural(input);

        assertTrue(result.contains("<Picture 1>"));
        assertEquals(
                "<Picture 1> 在河边洗衣裳，阳光照在水面上 俯拍镜头缓慢下降至水面 自然光，纪实风格",
                result);
    }

    @Test
    void passesThroughNaturalPromptWithoutStructure() {
        String input = "A woman walking through a wheat field in golden hour light, camera slowly dollies in from behind, cinematic style with film grain";
        String result = Agnes25PromptAdapter.reformatToNatural(input);
        assertEquals(input, result);
    }

    @Test
    void passesThroughBlank() {
        assertEquals(null, Agnes25PromptAdapter.reformatToNatural(null));
        assertEquals("", Agnes25PromptAdapter.reformatToNatural(""));
        assertEquals("   ", Agnes25PromptAdapter.reformatToNatural("   "));
    }

    @Test
    void handlesSingleSectionOnly() {
        String input = "# 主题\n" +
                "一位男子在雨中奔跑";
        // Only one section → no reformat needed (need >= 2 sections)
        String result = Agnes25PromptAdapter.reformatToNatural(input);
        assertEquals(input, result);
    }

    @Test
    void handlesTwoSections() {
        String input = "# 运镜\n" +
                "镜头缓慢横移\n\n" +
                "# 风格\n" +
                "冷色调，极简";
        String result = Agnes25PromptAdapter.reformatToNatural(input);
        assertEquals("镜头缓慢横移 冷色调，极简", result);
    }

    @Test
    void handlesMultilineSectionContent() {
        String input = "# 主题\n" +
                "第一行内容\n第二行内容\n\n" +
                "# 运镜\n" +
                "推镜\n\n" +
                "# 风格\n" +
                "暖色";
        String result = Agnes25PromptAdapter.reformatToNatural(input);
        assertEquals("第一行内容\n第二行内容 推镜 暖色", result);
    }

    @Test
    void handlesPromptWithPictureAndAudioRefs() {
        String input = "# 主题\n" +
                "<Picture 1> 唱歌，<Audio 1> 的声音\n\n" +
                "# 运镜\n" +
                "环绕镜头\n\n" +
                "# 风格\n" +
                "音乐MV风格";

        String result = Agnes25PromptAdapter.reformatToNatural(input);

        assertTrue(result.contains("<Picture 1>"));
        assertTrue(result.contains("<Audio 1>"));
    }

    @Test
    void handlesExtraWhitespaceInHeaders() {
        String input = "  #   主题  \n" +
                "内容A\n\n" +
                "  # 运镜\n" +
                "内容B";
        String result = Agnes25PromptAdapter.reformatToNatural(input);
        assertEquals("内容A 内容B", result);
    }

    @Test
    void preservesVideoReferences() {
        String input = "# 主题\n" +
                "参考 <Video 1> 的动作\n\n" +
                "# 运镜\n" +
                "跟拍\n\n" +
                "# 风格\n" +
                "动作片";
        String result = Agnes25PromptAdapter.reformatToNatural(input);
        assertTrue(result.contains("<Video 1>"));
    }
}
