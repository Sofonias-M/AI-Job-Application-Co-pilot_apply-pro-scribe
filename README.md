# Application Strategist Pro

Build a single-page web app called "AI Job Application Co-pilot".

BRAND THEME (apply to every element — no default purple/blue/grey):
- Page background: warm paper #F5F7F4 (not white)
- All headings: deep forest green #12331F, in Georgia or similar elegant serif
- All labels and small text: secondary green #014C1F
- Primary button ("Optimize"): solid #12331F background, white text, gold #D4A843 on hover
- Gold accent #D4A843 for active underlines, focus rings, highlights,
  and a small gold dot beside the app name in the header
- Cards: white #FFFFFF, rounded corners, soft subtle shadow on the paper background
- Score cards: muted pastel tints — Before=soft red, After=soft green (slightly larger),
  Boost=soft blue, Salary=soft warm gold (#FDF6E3)
- No purple, no gradients — warm greens and gold throughout

LAYOUT — single page, two main areas stacked, plus a persistent tracker at the bottom.

HEADER:
- App name: "AI Job Application Co-pilot" with a small gold dot
- Tagline on right: "Your personal application strategist" in secondary green

ANALYZER SECTION (top):
- Heading: "Application Analyzer"
- Subtitle: "Paste your CV and the job description. We'll tailor your application for this role."
- Inputs in a responsive grid:
  1. "Company Name" (short input, placeholder "e.g. Acme Corp")
  2. "Role / Job Title" (short input, placeholder "e.g. Senior Product Manager")
  3. "Your Email" (short input, placeholder "you@example.com")
  4. "Your Current CV" (large text area)
  5. "Job Description" (large text area) with a small "Generate sample JD" button
     beside the label
- Primary button: "Optimize Application" (deep green, full width or prominent)

"GENERATE SAMPLE JD" BUTTON:
- On click, read the "Role / Job Title" field and call AI to generate a realistic
  200-300 word job description for that specific role. If Role is empty, default to
  "Senior Product Manager". Show a spinner while generating. Fill into the JD field.

FIELD VALIDATION (before sending to webhook):
- On "Optimize" click, check every field:
  CV not empty, JD not empty, Company not empty, Role not empty,
  Email not empty AND valid email format.
- If any fail: highlight in red, show inline error, do NOT call the webhook.
- Only proceed when ALL fields are valid.

RESULTS SECTION (hidden until results arrive):
- Four score cards in a responsive row:
  1. "Before Score" (soft red) = score_before
  2. "After Score" (soft green, slightly larger) = score_after
  3. "Boost" (soft blue) = "+" improvement_percent "%"
  4. "Est. Salary" (soft gold) = salary_estimate. If missing, show "—".
- "Download Both (PDF)" button — exports optimized CV + cover letter as one PDF
- Sections below, each with a Copy button:
  - Keywords Addressed — missing_keywords as pill badges
  - Key Changes Made — key_changes as bullets with green checkmarks
  - Optimized CV — full text, with Copy and "Download PDF" buttons
  - Cover Letter — full text, with Copy and "Download PDF" buttons
  - Interview Questions — cards showing each question + tip
    (accept { q, tip } OR { question, tip } format)

APPLICATION TRACKER (always-visible section at bottom, NOT inside results):
- Enable Lovable Cloud (Supabase backend) for this app.
- Store tracker entries in a table: id, company, role, score_after, date, status, created_at.
- On page load, read all entries, newest first.
- Columns: Company, Role, Score, Date, Status.
- Status = editable dropdown: Applied, Reviewed, Interviewing, Offer, Rejected.
  Changing it updates the row in the database.
- Every successful Optimize inserts a new row (status default "Applied").

WEBHOOK CONNECTION (will be added via a follow-up prompt after n8n is ready):
- Build the Optimize button so it is READY to POST to a webhook URL, but do NOT
  hardcode any URL yet. Use a constant like WEBHOOK_URL that defaults to empty.
  When it's empty, show a message: "Webhook not connected yet."
- When a URL IS set, POST this JSON on valid Optimize:
  { "cv": cv, "jobDescription": jd, "company": company, "role": role, "email": email, "date": new Date().toISOString() }
- IMPORTANT: set the fetch timeout to 120 seconds (not 15). The AI backend takes
  30-60 seconds to analyze. A short timeout causes false failures.
- Show a loading spinner + "Analyzing your CV..." message while waiting.
- Read the response TOLERANTLY:
  Accept nested under json/data/result/body or directly.
  Accept snake_case or camelCase for all fields:
  score_before/scoreBefore, score_after/scoreAfter,
  improvement_percent/improvementPercent, salary_estimate/salaryEstimate/salary_range,
  missing_keywords/missingKeywords, key_changes/keyChanges,
  optimized_cv/optimizedCV/rewritten_cv, cover_letter/coverLetter,
  interview_questions/interviewQuestions/questions.
  Coerce arrays. Compute improvement from scores if missing.
  Missing single field = leave that section empty, never crash.
- On SUCCESS: show a small green banner "Live from your n8n backend ✓"
- FALLBACK: if webhook fails, times out, or returns no usable data, call your own AI
  to analyze the CV vs job description and produce the same fields.
  Show amber banner: "Showing AI-generated preview — your n8n backend didn't respond.
  Check your workflow." Never hide it.

STYLE: clean, modern, generous whitespace, mobile-friendly.
No debug panels, no console output, no code visible to users.
Only use the webhook plus the AI fallback — no other external backend.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/87a4b54a-2d41-4ce8-923d-e614dbc6c15e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
