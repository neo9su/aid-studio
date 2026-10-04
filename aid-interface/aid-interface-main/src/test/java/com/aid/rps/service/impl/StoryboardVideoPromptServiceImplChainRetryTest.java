package com.aid.rps.service.impl;

import com.aid.aid.domain.AidExtractTask;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StoryboardVideoPromptServiceImplChainRetryTest
{
    @Test
    void chainFailureWithoutChildCanRetryAfterPromptsAreReady()
    {
        AidExtractTask task = task(
                "{\"chainNext\":{\"type\":\"video\"}}",
                "{\"successCount\":14,\"failCount\":0,\"chainFailed\":true}");

        assertTrue(StoryboardVideoPromptServiceImpl.isChainRetryOnly(task));
    }

    @Test
    void successfulExistingChildDoesNotRetryChain()
    {
        AidExtractTask task = task(
                "{\"chainNext\":{\"type\":\"video\"}}",
                "{\"chainChildTaskId\":88,\"chainFailed\":false}");

        assertFalse(StoryboardVideoPromptServiceImpl.isChainRetryOnly(task));
    }

    @Test
    void ordinaryPromptTaskDoesNotRetryChain()
    {
        AidExtractTask task = task("{\"storyboardIds\":[1]}", "{\"chainFailed\":true}");

        assertFalse(StoryboardVideoPromptServiceImpl.isChainRetryOnly(task));
    }

    @Test
    void audioPreferenceIsDeferredWhenVideoModelWasNotExplicitlySelected()
    {
        assertNull(StoryboardVideoPromptServiceImpl.resolveChainedGenerateAudio(null, true));
        assertNull(StoryboardVideoPromptServiceImpl.resolveChainedGenerateAudio("  ", false));
        assertTrue(StoryboardVideoPromptServiceImpl.resolveChainedGenerateAudio("agnes-video-2.5-flash", true));
    }

    private static AidExtractTask task(String inputSnapshot, String resultData)
    {
        AidExtractTask task = new AidExtractTask();
        task.setInputSnapshot(inputSnapshot);
        task.setResultData(resultData);
        return task;
    }
}
