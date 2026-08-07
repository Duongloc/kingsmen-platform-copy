-- Add email fields to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS real_email TEXT,
ADD COLUMN IF NOT EXISTS receive_weekly_report BOOLEAN DEFAULT false;
