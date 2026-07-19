
CREATE TABLE public.job_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  score_after INTEGER,
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'Applied',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read job applications" ON public.job_applications FOR SELECT USING (true);
CREATE POLICY "Public insert job applications" ON public.job_applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update job applications" ON public.job_applications FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete job applications" ON public.job_applications FOR DELETE USING (true);
