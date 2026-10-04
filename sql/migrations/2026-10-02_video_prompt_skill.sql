-- ============================================================
-- Migration: video-prompt-agnes25 skill
-- Date: 2026-10-02
-- Purpose: Create a per-model prompt skill for Agnes Video 2.5.
--          The skill's system_prompt instructs the LLM to output
--          concise English natural language video prompts optimized
--          for the Agnes 2.5 model (no 3-section structure).
-- ============================================================

-- 1. Insert the skill main record
INSERT INTO aid_skill (skill_code, name, description, capability_description, owner_type, visibility,
  invocation_scope, executor_type, model_code, input_schema_json, output_schema_json, system_prompt,
  reasoning_policy, default_reasoning_enabled, show_reasoning_default, reasoning_budget_tokens,
  max_output_tokens, context_window_tokens, safety_margin_tokens, definition_json,
  config_hash, status, del_flag, create_by, create_time, update_by, update_time)
SELECT 'video-prompt-agnes25', 'Agnes 2.5 视频提示词',
  'INTERNAL: 为 Agnes Video 2.5 模型生成英文自然语言视频提示词',
  '为 Agnes Video 2.5 生成优化提示词，输出简洁英文自然语言描述（无三段结构）',
  'PLATFORM', 'PRIVATE', 'INTERNAL',
  'PROMPT', 'qwen3.8-27b', '{}', '{}',
  '你是 Agnes Video 2.5 视频生成模型的提示词工程师。根据用户提供的分镜数据，为每个镜头生成一段简洁的英文自然语言视频描述。

要求：
1. 输出纯英文，200词以内。
2. 将场景描述、运镜方式、视觉风格融合为一段流畅的自然语言段落，不使用标题、编号或分段。
3. 保留素材引用标记 <Picture N>、<Video N>、<Audio N> 不变。
4. 运镜描述用专业电影术语（dolly, pan, tilt, tracking, crane, handheld, static 等）。
5. 风格描述用视觉关键词（cinematic, documentary, anime, noir, warm/cool tone, shallow DOF 等）。
6. 若用户数据含中文，翻译为自然英文（不是逐字翻译）。
7. 输出格式必须严格遵循用户消息末尾的 JSON 输出契约。',
  'DISABLED', 0, 0, 0,
  16384, 180224, 4096,
  '{"schemaVersion":1,"targetModel":"agnes-video-2.5-flash"}',
  SHA2('video-prompt-agnes25-v1', 256),
  '0', '0', 'system', NOW(), 'system', NOW()
WHERE NOT EXISTS (SELECT 1 FROM aid_skill WHERE skill_code = 'video-prompt-agnes25');

-- 2. Insert the skill version (active)
INSERT INTO aid_skill_version (skill_id, version_code, visibility, invocation_scope, publish_status,
  executor_type, model_code, package_digest, manifest_json, input_schema_json, output_schema_json,
  system_prompt, definition_json, max_output_tokens, context_window_tokens, safety_margin_tokens,
  status, del_flag, create_by, create_time, update_by, update_time, remark)
SELECT s.id, '1.0.0', s.visibility, s.invocation_scope, 'PRIVATE', s.executor_type, s.model_code,
  SHA2(CONCAT('video-prompt-agnes25:1.0.0:', NOW()), 256),
  CONCAT('{"formatVersion":"1","code":"video-prompt-agnes25","version":"1.0.0","invocationScope":"INTERNAL","source":"migration:2026-10-02"}'),
  s.input_schema_json, s.output_schema_json, s.system_prompt, s.definition_json,
  s.max_output_tokens, s.context_window_tokens, s.safety_margin_tokens,
  '0', '0', 'system', NOW(), 'system', NOW(), '初始版本 — Agnes 2.5 英文自然语言提示词'
FROM aid_skill s
WHERE s.skill_code = 'video-prompt-agnes25'
  AND NOT EXISTS (SELECT 1 FROM aid_skill_version v WHERE v.skill_id = s.id AND v.version_code = '1.0.0');

-- 3. Link skill to its version
UPDATE aid_skill s
JOIN aid_skill_version v ON v.skill_id = s.id AND v.version_code = '1.0.0'
SET s.current_version_id = v.id, s.update_by = 'system', s.update_time = NOW()
WHERE s.skill_code = 'video-prompt-agnes25' AND s.current_version_id IS NULL;
