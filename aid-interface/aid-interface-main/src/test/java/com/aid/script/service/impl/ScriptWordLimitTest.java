package com.aid.script.service.impl;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import com.aid.aid.domain.AidComicEpisode;
import com.aid.aid.domain.AidComicProject;
import com.aid.aid.service.IAidComicEpisodeService;
import com.aid.aid.service.IAidComicProjectService;
import com.aid.aid.service.IAidComicScriptService;
import com.aid.common.exception.ServiceException;
import com.aid.project.service.IProjectContentGuardService;
import com.aid.script.dto.ScriptSplitPreviewRequest;
import com.aid.script.helper.ScriptEpisodeSplitter.EpisodeSegment;
import com.baomidou.mybatisplus.core.conditions.Wrapper;

class ScriptWordLimitTest {

    private UserScriptBusinessServiceImpl userScriptService;
    private IAidComicProjectService projectService;
    private IAidComicEpisodeService episodeService;

    @BeforeEach
    void setUp() {
        userScriptService = new UserScriptBusinessServiceImpl();
        projectService = mock(IAidComicProjectService.class);
        episodeService = mock(IAidComicEpisodeService.class);
        ReflectionTestUtils.setField(userScriptService, "aidComicProjectService", projectService);
        ReflectionTestUtils.setField(userScriptService, "aidComicEpisodeService", episodeService);
        ReflectionTestUtils.setField(userScriptService, "projectContentGuardService",
                mock(IProjectContentGuardService.class));
    }

    @Test
    void splitAllowsSecondEpisodeLongerThanTenThousandCharacters() {
        ScriptSplitServiceImpl splitService = new ScriptSplitServiceImpl(
                mock(IAidComicProjectService.class), mock(IAidComicEpisodeService.class),
                mock(IAidComicScriptService.class), mock(StringRedisTemplate.class),
                mock(TransactionTemplate.class), mock(IProjectContentGuardService.class));
        ScriptSplitPreviewRequest request = new ScriptSplitPreviewRequest();
        request.setProjectId(2L);
        request.setEpisodeKeyword("第一集");
        request.setScriptText("第一集\n开场\n第二集\n" + "情".repeat(12_000));

        List<EpisodeSegment> segments = ReflectionTestUtils.invokeMethod(
                splitService, "parseAndValidate", request);

        assertEquals(2, segments.size());
        assertEquals(12_000, segments.get(1).getContent().length());
    }

    @Test
    void seriesEpisodeSaveAllowsMoreThanTenThousandCharacters() {
        AidComicProject project = new AidComicProject();
        project.setId(2L);
        project.setUserId(7L);
        project.setProjectType("series");
        AidComicEpisode episode = new AidComicEpisode();
        episode.setId(9L);
        episode.setProjectId(2L);
        when(projectService.getOne(any(Wrapper.class))).thenReturn(project);
        when(episodeService.getOne(any(Wrapper.class))).thenReturn(episode);

        assertDoesNotThrow(() -> ReflectionTestUtils.invokeMethod(userScriptService,
                "validateRequest", 2L, 9L, "字".repeat(12_000), 7L, false));
    }

    @Test
    void movieSaveStillRejectsMoreThanTenThousandCharacters() {
        AidComicProject project = new AidComicProject();
        project.setId(2L);
        project.setUserId(7L);
        project.setProjectType("movie");
        when(projectService.getOne(any(Wrapper.class))).thenReturn(project);

        ServiceException failure = assertThrows(ServiceException.class,
                () -> ReflectionTestUtils.invokeMethod(userScriptService,
                        "validateRequest", 2L, 0L, "字".repeat(10_001), 7L, false));

        assertEquals("剧本超1万字", failure.getMessage());
    }
}
