package com.aid.media.provider.impl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AgnesVideoProviderClientTest {

    @Test
    void recognizesRetryableBusySubmissionErrors() {
        assertTrue(AgnesVideoProviderClient.isRetryableSubmitError(
                "video queue is full, please retry later"));
        assertTrue(AgnesVideoProviderClient.isRetryableSubmitError(
                "Too many requests. Please try again in a moment."));
        assertTrue(AgnesVideoProviderClient.isRetryableSubmitError("Service busy"));
    }

    @Test
    void doesNotRetryPermanentSubmissionErrors() {
        assertFalse(AgnesVideoProviderClient.isRetryableSubmitError(
                "media must be a public http(s) URL or base64 data"));
        assertFalse(AgnesVideoProviderClient.isRetryableSubmitError(null));
    }
}
