package com.aid.media.reference.impl;

import com.aid.domain.vo.AiModelConfigVo;
import com.aid.media.reference.ImageReferenceRenderContext;
import com.aid.media.reference.ImageReferenceRenderPlan;
import com.aid.rps.resolver.StoryboardImageReferenceResolver.RefType;
import com.aid.rps.resolver.StoryboardImageReferenceResolver.ResolvedImageReference;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AgnesImageReferenceRenderStrategyTest {

    private final AgnesImageReferenceRenderStrategy strategy = new AgnesImageReferenceRenderStrategy();

    @Test
    void repeatedReferenceUrlUsesOneImageSlot() {
        ImageReferenceRenderPlan plan = strategy.render(context(List.of(
                reference(1, "a", "url-1"), reference(2, "b", "url-1"),
                reference(3, "c", "url-2"), reference(4, "d", "url-3"),
                reference(5, "e", "url-4"))));

        assertEquals(List.of("url-1", "url-2", "url-3", "url-4"), plan.getReferenceImageUrls());
        assertTrue(plan.getFinalPrompt().contains("图1=a（人物）"));
        assertTrue(plan.getFinalPrompt().contains("图1=b（人物）"));
    }

    @Test
    void distinctReferencesStillRejectOverConfiguredLimit() {
        assertThrows(com.aid.common.exception.ServiceException.class, () -> strategy.render(context(List.of(
                reference(1, "a", "url-1"), reference(2, "b", "url-2"),
                reference(3, "c", "url-3"), reference(4, "d", "url-4"),
                reference(5, "e", "url-5")))));
    }

    private ImageReferenceRenderContext context(List<ResolvedImageReference> references) {
        AiModelConfigVo config = new AiModelConfigVo();
        config.setCapabilityJson("{\"maxReferenceImages\":4}");
        String prompt = "@\u56fe\u72471[a] @\u56fe\u72472[b] @\u56fe\u72473[c] @\u56fe\u72474[d] @\u56fe\u72475[e]";
        return new ImageReferenceRenderContext(prompt, references, config, 4);
    }

    private ResolvedImageReference reference(int n, String name, String url) {
        ResolvedImageReference ref = new ResolvedImageReference();
        ref.setN(n);
        ref.setName(name);
        ref.setAssetName(name);
        ref.setAssetKind("character");
        ref.setType(RefType.REFERENCE);
        ref.setUrl(url);
        return ref;
    }
}
