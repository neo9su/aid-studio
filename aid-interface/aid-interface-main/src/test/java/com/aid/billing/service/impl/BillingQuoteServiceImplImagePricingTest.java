package com.aid.billing.service.impl;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.aid.billing.dto.BillingCalcResult;
import com.aid.billing.dto.BillingQuoteRequest;
import com.aid.billing.service.BillingPreHoldCalculationService;
import com.aid.billing.service.BillingQuoteAssembler;
import com.aid.billing.service.BusinessBillingQuoteAdapter;
import com.aid.billing.vo.BillingQuoteVO;
import com.aid.domain.vo.AiModelConfigVo;
import com.aid.media.service.MediaBillingQuotePreparer;
import com.aid.project.service.IUserProjectBusinessService;
import com.aid.service.IAiModelConfigService;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.validation.Validator;

class BillingQuoteServiceImplImagePricingTest
{
    @Test
    void textToImagePricingSelectsTextCapabilityInsteadOfModelDefault()
    {
        ObjectMapper objectMapper = new ObjectMapper();
        MediaBillingQuotePreparer preparer = mock(MediaBillingQuotePreparer.class);
        BillingPreHoldCalculationService calculator = mock(BillingPreHoldCalculationService.class);
        BillingQuoteAssembler assembler = mock(BillingQuoteAssembler.class);
        IAiModelConfigService configs = mock(IAiModelConfigService.class);
        IUserProjectBusinessService projects = mock(IUserProjectBusinessService.class);
        Validator validator = mock(Validator.class);
        when(validator.validate(any())).thenReturn(Collections.emptySet());

        AiModelConfigVo textToImage = new AiModelConfigVo();
        textToImage.setModelCode("agnes-image-2.1-flash");
        textToImage.setModelType("image");
        textToImage.setGenerateMode("text_to_image");
        textToImage.setCapabilityCode("text_to_image");
        textToImage.setSupportsTextInput(true);
        textToImage.setSupportsImageInput(true);
        textToImage.setMaxOutputCount(1);
        textToImage.setDefaultOutputCount(1);
        textToImage.setCapabilityJson("{\"minReferenceImages\":0,\"sceneRules\":{\"textToImage\":{}}}");
        when(configs.selectByModelCodeForUser(
                "agnes-image-2.1-flash", 7L, "text_to_image")).thenReturn(textToImage);

        BillingCalcResult calculation = BillingCalcResult.fixed(BigDecimal.ZERO, null);
        when(calculator.calculate(eq(textToImage), any())).thenReturn(calculation);
        BillingQuoteVO expected = new BillingQuoteVO();
        when(assembler.single("MEDIA_IMAGE_PRICING", textToImage, calculation, 1))
                .thenReturn(expected);

        BillingQuoteServiceImpl service = new BillingQuoteServiceImpl(
                objectMapper, preparer, calculator, assembler, configs, projects,
                List.<BusinessBillingQuoteAdapter>of(), validator);
        BillingQuoteRequest request = new BillingQuoteRequest();
        request.setQuoteType("MEDIA_IMAGE_PRICING");
        request.setPayload(objectMapper.valueToTree(java.util.Map.of(
                "modelCode", "agnes-image-2.1-flash",
                "generateMode", "TEXT_TO_IMAGE",
                "expectedImageCount", 1,
                "referenceImageCount", 0)));

        assertSame(expected, service.quote(request, 7L));
        verify(configs).selectByModelCodeForUser(
                "agnes-image-2.1-flash", 7L, "text_to_image");
    }

    @Test
    void pricingModeMapsImageEditToImageCapability()
    {
        assertEquals("text_to_image", BillingQuoteServiceImpl.imageCapabilityForPricing("TEXT_TO_IMAGE"));
        assertEquals("image_to_image", BillingQuoteServiceImpl.imageCapabilityForPricing("IMAGE_EDIT"));
        assertEquals("image_to_image", BillingQuoteServiceImpl.imageCapabilityForPricing("IMAGE_TO_IMAGE"));
    }
}
