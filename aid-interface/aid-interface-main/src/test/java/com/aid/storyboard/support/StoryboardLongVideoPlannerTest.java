package com.aid.storyboard.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.aid.domain.vo.AiModelConfigVo;
import com.aid.storyboard.support.StoryboardLongVideoPlanner.Segment;

class StoryboardLongVideoPlannerTest
{
    @Test
    void agnesTwentyFourSecondsSplitsIntoTwoTwelveSecondSegments()
    {
        List<Segment> segments = StoryboardLongVideoPlanner.plan("连续剧情", 24, agnes());

        assertEquals(List.of(12, 12), segments.stream().map(Segment::seconds).toList());
        assertTrue(segments.get(0).prompt().contains("1/2"));
    }

    @Test
    void localH3TwentyFourSecondsUsesThreeHardwareSafeSegments()
    {
        List<Segment> segments = StoryboardLongVideoPlanner.plan("连续剧情", 24, localH3());

        assertEquals(List.of(8, 8, 8), segments.stream().map(Segment::seconds).toList());
    }

    @Test
    void explicitSceneDurationsAndTextArePreserved()
    {
        String prompt = "第一幕8秒：女子推门进入。\n第二幕8秒：男子转身回应。";
        List<Segment> segments = StoryboardLongVideoPlanner.plan(prompt, 16, agnes());

        assertEquals(List.of(8, 8), segments.stream().map(Segment::seconds).toList());
        assertTrue(segments.get(0).explicit());
        assertTrue(segments.get(0).prompt().contains("女子推门进入"));
        assertTrue(segments.get(1).prompt().contains("男子转身回应"));
    }

    private static AiModelConfigVo agnes()
    {
        AiModelConfigVo model = new AiModelConfigVo();
        model.setProviderCode("agnes");
        model.setModelCode("agnes-video-2.5-flash");
        return model;
    }

    private static AiModelConfigVo localH3()
    {
        AiModelConfigVo model = new AiModelConfigVo();
        model.setProviderCode("minimax");
        model.setModelCode("minimax-h3-t2v");
        model.setBaseUrl("http://127.0.0.1:19090");
        return model;
    }
}
