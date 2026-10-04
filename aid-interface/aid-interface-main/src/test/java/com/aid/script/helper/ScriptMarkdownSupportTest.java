package com.aid.script.helper;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.aid.script.helper.ScriptEpisodeSplitter.EpisodeSegment;

class ScriptMarkdownSupportTest {

    @Test
    void extractsMarkdownAsUtf8Text() {
        String source = "# 第一集\n\n**赵小刚**：我回来了。";
        MockMultipartFile file = new MockMultipartFile(
                "file", "story.md", "text/markdown", source.getBytes(StandardCharsets.UTF_8));

        assertEquals(source, ScriptFileExtractor.extractText(file, ScriptFileExtractor.EXT_MD));
    }

    @Test
    void splitsMarkdownHeadingEpisodesWithoutLosingBodyMarkdown() {
        String source = "# 第一集：回村 ##\n\n**赵小刚**：我回来了。"
                + "\n\n## 第2集 风波\n\n- 场景：村口";

        List<EpisodeSegment> segments = ScriptEpisodeSplitter.split(source, "第一集");

        assertEquals(2, segments.size());
        assertEquals("回村", segments.get(0).getTitle());
        assertEquals("**赵小刚**：我回来了。", segments.get(0).getContent());
        assertEquals("风波", segments.get(1).getTitle());
        assertEquals("- 场景：村口", segments.get(1).getContent());
    }
}
