import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callGateway(body: unknown): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit exceeded. Please try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits.");
    throw new Error(`AI gateway error: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

export const generateJobDescription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ role: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const content = await callGateway({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You write realistic, well-structured job descriptions of 200-300 words. Include: brief company blurb, role summary, key responsibilities (5-7 bullets), required qualifications (5-6 bullets), and nice-to-haves (2-3 bullets). Return plain text only, no markdown headers.",
        },
        { role: "user", content: `Write a realistic job description for: ${data.role}` },
      ],
    });
    return { jobDescription: content.trim() };
  });

const AnalysisSchema = z.object({
  score_before: z.number(),
  score_after: z.number(),
  improvement_percent: z.number(),
  salary_estimate: z.string(),
  missing_keywords: z.array(z.string()),
  key_changes: z.array(z.string()),
  optimized_cv: z.string(),
  cover_letter: z.string(),
  interview_questions: z.array(
    z.object({ question: z.string(), tip: z.string() }),
  ),
});

export const analyzeApplication = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        cv: z.string().min(1),
        jobDescription: z.string().min(1),
        company: z.string().min(1),
        role: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const prompt = `You are an expert career coach. Analyze this CV against the job description for the role of "${data.role}" at "${data.company}". Return ONLY valid JSON matching this exact schema:
{
  "score_before": number (0-100, current CV match),
  "score_after": number (0-100, optimized CV match, higher than before),
  "improvement_percent": number (percentage improvement),
  "salary_estimate": string (e.g. "$120,000 - $150,000"),
  "missing_keywords": string[] (5-10 keywords from JD missing in CV),
  "key_changes": string[] (5-8 concrete changes made),
  "optimized_cv": string (full rewritten CV, plain text with line breaks),
  "cover_letter": string (full tailored cover letter, plain text),
  "interview_questions": [{ "question": string, "tip": string }] (5 likely questions with prep tips)
}

CV:
${data.cv}

JOB DESCRIPTION:
${data.jobDescription}

Return ONLY the JSON object, no markdown fences, no commentary.`;

    const content = await callGateway({
      model: MODEL,
      messages: [
        { role: "system", content: "You are an expert career coach. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    let parsed: unknown;
    try {
      const cleaned = content
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "");
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned invalid JSON");
    }
    return AnalysisSchema.parse(parsed);
  });
