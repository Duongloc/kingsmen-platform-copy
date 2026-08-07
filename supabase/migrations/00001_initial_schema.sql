-- ═══════════════════════════════════════════════════════════════
-- KINGSMEN TRAINING PLATFORM — Full Database Schema
-- Run this in the Supabase SQL Editor to set up a fresh project
-- ═══════════════════════════════════════════════════════════════

-- ── 1. TABLES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  emp_id text NOT NULL,
  dept text NOT NULL DEFAULT 'Kinh doanh',
  team text DEFAULT '',
  acc_role text NOT NULL DEFAULT 'employee'
    CHECK (acc_role IN ('employee', 'manager', 'director')),
  xp integer DEFAULT 0,
  streak integer DEFAULT 0,
  check_ins jsonb DEFAULT '[]',
  read_lessons text[] DEFAULT '{}',
  path_progress jsonb DEFAULT '{}',
  avatar text,
  last_check_in date,
  last_xp_gain_date date,
  status text DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  deactivated_at timestamptz,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.knowledge (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  title text NOT NULL,
  content text,
  depts text[] DEFAULT '{"Tất cả"}',
  doc_url text DEFAULT '',
  has_pdf boolean DEFAULT false,
  pdf_name text,
  interactive jsonb,
  video_url text DEFAULT '',
  audio_url text DEFAULT '',
  images jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT knowledge_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.quizzes (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  knowledge_id text REFERENCES public.knowledge(id),
  title text NOT NULL,
  questions jsonb NOT NULL DEFAULT '[]',
  time_limit integer DEFAULT 2400,
  depts text[] DEFAULT '{"Tất cả"}',
  ai_generated boolean DEFAULT false,
  difficulty text DEFAULT 'medium',
  quiz_type text DEFAULT 'mc',
  imported_from text,
  hidden boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT quizzes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.results (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  emp_id uuid NOT NULL REFERENCES public.profiles(id),
  quiz_id text REFERENCES public.quizzes(id),
  quiz_title text,
  score integer DEFAULT 0,
  total integer DEFAULT 0,
  pct real DEFAULT 0,
  passed boolean DEFAULT false,
  time_taken integer DEFAULT 0,
  answers jsonb DEFAULT '[]',
  quiz_type text DEFAULT 'mc',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT results_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.challenges (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  title text NOT NULL,
  quiz_id text REFERENCES public.quizzes(id),
  quiz_title text DEFAULT '',
  knowledge_id text REFERENCES public.knowledge(id),
  knowledge_title text DEFAULT '',
  min_score integer DEFAULT 70,
  deadline timestamptz,
  assign_to text DEFAULT 'all',
  assign_dept text,
  rewards jsonb DEFAULT '[]',
  active boolean DEFAULT true,
  xp_bonus integer DEFAULT 50,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  created_by_name text DEFAULT '',
  completed_by jsonb DEFAULT '[]',
  won_rewards jsonb DEFAULT '{}',
  delivered jsonb DEFAULT '{}',
  CONSTRAINT challenges_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.challenge_completions (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  challenge_id text NOT NULL REFERENCES public.challenges(id),
  emp_id uuid NOT NULL REFERENCES public.profiles(id),
  won_rewards jsonb DEFAULT '[]',
  delivered boolean DEFAULT false,
  completed_at timestamptz DEFAULT now(),
  CONSTRAINT challenge_completions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  emp_id uuid NOT NULL REFERENCES public.profiles(id),
  msg text NOT NULL,
  type text DEFAULT 'info',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.recognitions (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  emp_id uuid NOT NULL REFERENCES public.profiles(id),
  emp_name text,
  type text DEFAULT 'excellent',
  message text DEFAULT '',
  given_by text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT recognitions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.paths (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  title text NOT NULL,
  dept text,
  description text DEFAULT '',
  stages jsonb NOT NULL DEFAULT '[]',
  assigned_to text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT paths_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.bulletins (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  title text NOT NULL,
  content text DEFAULT '',
  type text DEFAULT 'announce'
    CHECK (type IN ('announce', 'policy', 'news', 'event')),
  pinned boolean DEFAULT false,
  author text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT bulletins_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.settings (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  config jsonb NOT NULL DEFAULT '{
    "idleXP": 15, "decayXP": 10, "idleDays": 7, "streakXP": 10,
    "correctXP": 10, "decayDays": 3, "highBonus": 20, "passBonus": 30,
    "passScore": 70, "perfectBonus": 50, "adminPassword": ""
  }',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT settings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kingsmen_data (
  id text NOT NULL,
  value text,
  CONSTRAINT kingsmen_data_pkey PRIMARY KEY (id)
);


-- ── 2. RPC FUNCTIONS ───────────────────────────────────────────

-- Atomic XP increment (avoids read-modify-write races)
CREATE OR REPLACE FUNCTION public.increment_xp(
  p_user_id uuid,
  p_amount integer,
  p_date text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET
    xp = GREATEST(0, xp + p_amount),
    last_xp_gain_date = CASE
      WHEN p_amount > 0 AND p_date IS NOT NULL THEN p_date::date
      ELSE last_xp_gain_date
    END
  WHERE id = p_user_id;
END;
$$;

-- Atomic challenge completion (concurrent-safe)
CREATE OR REPLACE FUNCTION public.complete_challenge(
  p_challenge_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.challenges
  SET completed_by = CASE
    WHEN NOT (completed_by @> to_jsonb(p_user_id::text))
    THEN completed_by || to_jsonb(p_user_id::text)
    ELSE completed_by
  END
  WHERE id = p_challenge_id;
END;
$$;


-- ── 3. ROW LEVEL SECURITY (RLS) ───────────────────────────────

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recognitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kingsmen_data ENABLE ROW LEVEL SECURITY;

-- Helper: check if the current user is admin or director
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (emp_id = 'admin' OR acc_role = 'director')
  );
$$;

-- ── PROFILES ──
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR id = auth.uid());

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (is_admin() OR id = auth.uid());

-- ── QUIZZES ──
CREATE POLICY "quizzes_select" ON public.quizzes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "quizzes_insert" ON public.quizzes
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "quizzes_update" ON public.quizzes
  FOR UPDATE TO authenticated USING (is_admin());

CREATE POLICY "quizzes_delete" ON public.quizzes
  FOR DELETE TO authenticated USING (is_admin());

-- ── KNOWLEDGE ──
CREATE POLICY "knowledge_select" ON public.knowledge
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "knowledge_insert" ON public.knowledge
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "knowledge_update" ON public.knowledge
  FOR UPDATE TO authenticated USING (is_admin());

CREATE POLICY "knowledge_delete" ON public.knowledge
  FOR DELETE TO authenticated USING (is_admin());

-- ── RESULTS ──
CREATE POLICY "results_select_own" ON public.results
  FOR SELECT TO authenticated
  USING (emp_id = auth.uid() OR is_admin());

CREATE POLICY "results_insert" ON public.results
  FOR INSERT TO authenticated
  WITH CHECK (emp_id = auth.uid() OR is_admin());

CREATE POLICY "results_update" ON public.results
  FOR UPDATE TO authenticated
  USING (emp_id = auth.uid() OR is_admin());

-- ── CHALLENGES ──
CREATE POLICY "challenges_select" ON public.challenges
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "challenges_insert" ON public.challenges
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "challenges_update" ON public.challenges
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "challenges_delete" ON public.challenges
  FOR DELETE TO authenticated USING (is_admin());

-- ── CHALLENGE_COMPLETIONS ──
CREATE POLICY "challenge_completions_select" ON public.challenge_completions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "challenge_completions_insert" ON public.challenge_completions
  FOR INSERT TO authenticated
  WITH CHECK (emp_id = auth.uid() OR is_admin());

-- ── NOTIFICATIONS ──
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (emp_id = auth.uid() OR is_admin());

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (emp_id = auth.uid() OR is_admin());

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (emp_id = auth.uid() OR is_admin());

-- ── RECOGNITIONS ──
CREATE POLICY "recognitions_select" ON public.recognitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "recognitions_insert" ON public.recognitions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "recognitions_update" ON public.recognitions
  FOR UPDATE TO authenticated USING (is_admin());

-- ── PATHS ──
CREATE POLICY "paths_select" ON public.paths
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "paths_insert" ON public.paths
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "paths_update" ON public.paths
  FOR UPDATE TO authenticated USING (is_admin());

CREATE POLICY "paths_delete" ON public.paths
  FOR DELETE TO authenticated USING (is_admin());

-- ── BULLETINS ──
CREATE POLICY "bulletins_select" ON public.bulletins
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "bulletins_insert" ON public.bulletins
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "bulletins_update" ON public.bulletins
  FOR UPDATE TO authenticated USING (is_admin());

CREATE POLICY "bulletins_delete" ON public.bulletins
  FOR DELETE TO authenticated USING (is_admin());

-- ── SETTINGS ──
CREATE POLICY "settings_select" ON public.settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "settings_upsert" ON public.settings
  FOR ALL TO authenticated USING (is_admin());

-- ── KINGSMEN_DATA ──
CREATE POLICY "kingsmen_data_select" ON public.kingsmen_data
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "kingsmen_data_upsert" ON public.kingsmen_data
  FOR ALL TO authenticated USING (is_admin());


-- ── 4. SEED: Default settings row ─────────────────────────────

INSERT INTO public.settings (id, config) VALUES (1, '{
  "idleXP": 15, "decayXP": 10, "idleDays": 7, "streakXP": 10,
  "correctXP": 10, "decayDays": 3, "highBonus": 20, "passBonus": 30,
  "passScore": 70, "perfectBonus": 50, "adminPassword": ""
}') ON CONFLICT (id) DO NOTHING;


-- ── 5. SEED: Create initial admin user ─────────────────────────
-- NOTE: You must first create the auth user in Supabase Dashboard
-- or via the create-user edge function. Then insert the profile:
--
-- INSERT INTO public.profiles (id, name, emp_id, dept, acc_role, status)
-- VALUES ('<auth-user-uuid>', 'Admin', 'admin', 'Quản lý', 'director', 'active');
