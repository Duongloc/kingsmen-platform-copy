-- Migration: Fix challenges table RLS privilege escalation vulnerability
-- Previously, "challenges_update" allowed ANY authenticated user to update ANY challenge.
-- Now, only admins can update challenges directly. 
-- Standard employees will continue to use the atomic `complete_challenge` RPC.

DROP POLICY IF EXISTS "challenges_update" ON public.challenges;

CREATE POLICY "challenges_update" ON public.challenges
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
        AND (emp_id = 'admin' OR acc_role = 'director')
    )
  );
