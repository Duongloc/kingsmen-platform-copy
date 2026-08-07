-- Add knowledge link columns to challenges table
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS knowledge_id text REFERENCES public.knowledge(id),
  ADD COLUMN IF NOT EXISTS knowledge_title text DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivered jsonb DEFAULT '{}';
