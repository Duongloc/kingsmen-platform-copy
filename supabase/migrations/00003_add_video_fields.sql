-- ═══════════════════════════════════════════════════════════════
-- KINGSMEN TRAINING PLATFORM — Add video upload fields to knowledge
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.knowledge
  ADD COLUMN IF NOT EXISTS has_video boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_name text;
