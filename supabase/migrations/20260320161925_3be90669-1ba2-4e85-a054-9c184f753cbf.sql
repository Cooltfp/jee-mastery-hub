
-- Profiles table for level progression (no auth, using device_id for now)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text UNIQUE NOT NULL,
  highest_level_unlocked integer NOT NULL DEFAULT 1 CHECK (highest_level_unlocked >= 1 AND highest_level_unlocked <= 5),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to profiles" ON public.profiles
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Add confidence, level, chapter_name to test_sessions
ALTER TABLE public.test_sessions 
  ADD COLUMN confidence text DEFAULT null,
  ADD COLUMN level integer DEFAULT 3,
  ADD COLUMN chapter_name text DEFAULT null,
  ADD COLUMN device_id text DEFAULT null;
