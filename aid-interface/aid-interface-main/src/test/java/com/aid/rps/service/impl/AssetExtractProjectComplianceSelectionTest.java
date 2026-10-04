package com.aid.rps.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.test.util.ReflectionTestUtils;

import com.aid.aid.domain.AidComicProject;
import com.aid.aid.service.IAidComicProjectService;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;

class AssetExtractProjectComplianceSelectionTest
{
    @Test
    void validateProjectLoadsComplianceProfileForOutlineGateRouting()
    {
        MybatisConfiguration configuration = new MybatisConfiguration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "project-compliance-test");
        assistant.setCurrentNamespace("project-compliance-test");
        TableInfoHelper.initTableInfo(assistant, AidComicProject.class);

        IAidComicProjectService projectService = mock(IAidComicProjectService.class);
        AidComicProject stored = new AidComicProject();
        stored.setId(2L);
        stored.setComplianceProfile("PRIVATE_ADULT");
        when(projectService.getOne(any(LambdaQueryWrapper.class))).thenAnswer(invocation -> {
            LambdaQueryWrapper<?> query = invocation.getArgument(0);
            assertTrue(query.getSqlSelect().contains("compliance_profile"));
            return stored;
        });

        AssetExtractServiceImpl service = new AssetExtractServiceImpl();
        ReflectionTestUtils.setField(service, "projectService", projectService);

        AidComicProject result = ReflectionTestUtils.invokeMethod(service, "validateProject", 2L, 1L);
        assertEquals("PRIVATE_ADULT", result.getComplianceProfile());
    }
}
