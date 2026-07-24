-- Rename the assistant characters' internal ids from shadi/jumana to
-- sam/balqis. Data-only: it remaps existing rows so saved avatars, personas,
-- greetings, the chosen default, and analytics/FAQ history carry over. The
-- male character keeps the legacy single-bot keys (ai_assistant_avatar,
-- ai_persona, ai_greeting), so only the female character's keys are renamed.

-- Female character's per-character setting keys (ai_*_jumana -> ai_*_balqis).
UPDATE "PlatformSetting" SET "key" = 'ai_avatar_balqis'   WHERE "key" = 'ai_avatar_jumana';
UPDATE "PlatformSetting" SET "key" = 'ai_persona_balqis'  WHERE "key" = 'ai_persona_jumana';
UPDATE "PlatformSetting" SET "key" = 'ai_greeting_balqis' WHERE "key" = 'ai_greeting_jumana';

-- The default-character value (stored as a JSON string scalar).
UPDATE "PlatformSetting" SET "value" = '"sam"'::jsonb    WHERE "key" = 'ai_default_bot' AND "value" = '"shadi"'::jsonb;
UPDATE "PlatformSetting" SET "value" = '"balqis"'::jsonb WHERE "key" = 'ai_default_bot' AND "value" = '"jumana"'::jsonb;

-- Analytics + FAQ bot columns (plain text).
UPDATE "AiChatEvent" SET "bot" = 'sam'    WHERE "bot" = 'shadi';
UPDATE "AiChatEvent" SET "bot" = 'balqis' WHERE "bot" = 'jumana';
UPDATE "AiFaq"       SET "bot" = 'sam'    WHERE "bot" = 'shadi';
UPDATE "AiFaq"       SET "bot" = 'balqis' WHERE "bot" = 'jumana';
