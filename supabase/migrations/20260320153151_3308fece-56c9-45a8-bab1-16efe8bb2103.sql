-- Create test_sessions table
CREATE TABLE public.test_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  score INTEGER,
  max_score INTEGER,
  total_time_taken INTEGER,
  subject_wise JSONB,
  silly_errors JSONB,
  is_completed BOOLEAN NOT NULL DEFAULT false
);

-- Create questions table
CREATE TABLE public.questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.test_sessions(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  text TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  topic TEXT NOT NULL,
  marks INTEGER NOT NULL DEFAULT 4,
  negative_marks INTEGER NOT NULL DEFAULT 1
);

-- Create user_responses table
CREATE TABLE public.user_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.test_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer TEXT,
  time_spent REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not-visited',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_responses ENABLE ROW LEVEL SECURITY;

-- Allow public access (no auth required for this app)
CREATE POLICY "Allow all access to test_sessions" ON public.test_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to questions" ON public.questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to user_responses" ON public.user_responses FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_questions_session_id ON public.questions(session_id);
CREATE INDEX idx_user_responses_session_id ON public.user_responses(session_id);
CREATE INDEX idx_user_responses_question_id ON public.user_responses(question_id);