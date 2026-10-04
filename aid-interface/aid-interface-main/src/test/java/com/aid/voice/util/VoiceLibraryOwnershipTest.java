package com.aid.voice.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.aid.aid.domain.AidAiVoiceLibrary;

class VoiceLibraryOwnershipTest
{
    @Test
    void publicVoiceIsAvailableToAnyUser()
    {
        AidAiVoiceLibrary voice = new AidAiVoiceLibrary();
        voice.setCreateBy("admin");
        assertTrue(VoiceLibraryOwnership.canUse(voice, 7L));
    }

    @Test
    void clonedVoiceIsOnlyAvailableToItsOwner()
    {
        AidAiVoiceLibrary voice = new AidAiVoiceLibrary();
        voice.setCreateBy(VoiceLibraryOwnership.owner(7L));
        assertTrue(VoiceLibraryOwnership.canUse(voice, 7L));
        assertFalse(VoiceLibraryOwnership.canUse(voice, 8L));
        assertFalse(VoiceLibraryOwnership.canUse(voice, null));
    }
}
