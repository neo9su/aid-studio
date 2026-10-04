package com.aid.voice.util;

import com.aid.aid.domain.AidAiVoiceLibrary;

import cn.hutool.core.util.StrUtil;

/** 用户克隆音色沿用 create_by 保存私有归属，避免改变公共音色库表结构。 */
public final class VoiceLibraryOwnership
{
    private static final String USER_PREFIX = "user:";

    private VoiceLibraryOwnership() {}

    public static String owner(Long userId)
    {
        return USER_PREFIX + userId;
    }

    public static boolean isUserOwned(AidAiVoiceLibrary voice)
    {
        return voice != null && StrUtil.startWith(voice.getCreateBy(), USER_PREFIX);
    }

    public static boolean canUse(AidAiVoiceLibrary voice, Long userId)
    {
        return voice != null && (!isUserOwned(voice)
                || userId != null && owner(userId).equals(voice.getCreateBy()));
    }
}
