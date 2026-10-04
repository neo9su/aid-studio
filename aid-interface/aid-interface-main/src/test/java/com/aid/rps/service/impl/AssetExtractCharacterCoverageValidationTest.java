package com.aid.rps.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.aid.rps.helper.AssetExtractHelper;

class AssetExtractCharacterCoverageValidationTest
{
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final AssetExtractServiceImpl service = new AssetExtractServiceImpl();

    AssetExtractCharacterCoverageValidationTest()
    {
        ReflectionTestUtils.setField(service, "helper", new AssetExtractHelper());
    }

    @Test
    void rejectsEmptyArraysWhenOutlineHasRequiredCharacters() throws Exception
    {
        JsonNode empty = MAPPER.readTree("""
                {"new_characters":[],"updated_characters":[]}
                """);
        JsonNode oneCharacter = MAPPER.readTree("""
                {"new_characters":[{"name":"宋雨晴"}],"updated_characters":[]}
                """);

        assertFalse(service.isValidCharacterExtractResult(empty, true));
        assertTrue(service.isValidCharacterExtractResult(empty, false));
        assertTrue(service.isValidCharacterExtractResult(oneCharacter, true));
    }

    @Test
    void readsRequiredNamesFromRoutedOutlineManifest()
    {
        String content = """
                【项目总纲定向上下文】
                【角色标题清单（权威清单，必须逐项提取，不得遗漏）：宋雨晴、孙兰兰】
                ## 二、角色设定卡
                """;

        assertEquals("宋雨晴、孙兰兰", service.extractOutlineRequiredNames(content));
    }
}
