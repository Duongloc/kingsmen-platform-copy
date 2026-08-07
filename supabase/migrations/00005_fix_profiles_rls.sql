-- Migration: Fix profiles privilege escalation vulnerability
-- This trigger ensures that non-admin users cannot update sensitive columns
-- like acc_role, xp, emp_id, dept, and status on their own profile.

-- Update increment_xp to bypass the trigger safely
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
  -- Set a local variable that the trigger can read to allow this internal update
  PERFORM set_config('kingsmen.bypass_trigger', 'true', true);

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

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.check_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If bypassing trigger (e.g. from increment_xp RPC)
  IF current_setting('kingsmen.bypass_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- If the user is an admin (director or emp_id='admin'), allow all changes
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND (emp_id = 'admin' OR acc_role = 'director')
  ) THEN
    RETURN NEW;
  END IF;

  -- Otherwise, it's a normal user updating their own profile. Block sensitive columns:
  IF NEW.emp_id IS DISTINCT FROM OLD.emp_id THEN
    RAISE EXCEPTION 'Not allowed to change emp_id';
  END IF;
  IF NEW.acc_role IS DISTINCT FROM OLD.acc_role THEN
    RAISE EXCEPTION 'Not allowed to change acc_role';
  END IF;
  IF NEW.xp IS DISTINCT FROM OLD.xp THEN
    RAISE EXCEPTION 'Not allowed to change xp directly. Must use increment_xp RPC.';
  END IF;
  IF NEW.dept IS DISTINCT FROM OLD.dept THEN
    RAISE EXCEPTION 'Not allowed to change dept';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Not allowed to change status';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach the trigger to the profiles table
DROP TRIGGER IF EXISTS trigger_check_profile_update ON public.profiles;
CREATE TRIGGER trigger_check_profile_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_profile_update();
