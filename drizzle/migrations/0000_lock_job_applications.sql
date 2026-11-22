ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS owner_key uuid;
CREATE INDEX IF NOT EXISTS job_applications_owner_key_idx ON public.job_applications(owner_key);
DROP POLICY IF EXISTS "Public delete job applications" ON public.job_applications;
DROP POLICY IF EXISTS "Public insert job applications" ON public.job_applications;
DROP POLICY IF EXISTS "Public read job applications" ON public.job_applications;
DROP POLICY IF EXISTS "Public update job applications" ON public.job_applications;
REVOKE ALL ON public.job_applications FROM anon, authenticated;
GRANT ALL ON public.job_applications TO service_role;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;