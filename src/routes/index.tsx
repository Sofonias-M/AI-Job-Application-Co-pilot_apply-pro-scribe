import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  analyzeApplication,
  generateJobDescription,
} from "@/lib/ai.functions";

export const Route = createFileRoute("/")({
  component: CopilotPage,
});

const WEBHOOK_URL = "https://sofonias-m.app.n8n.cloud/webhook-test/cv-copilot";
const WEBHOOK_TIMEOUT_MS = 120_000;

const STATUSES = ["Applied", "Reviewed", "Interviewing", "Offer", "Rejected"] as const;
type Status = (typeof STATUSES)[number];

type Analysis = {
  score_before: number;
  score_after: number;
  improvement_percent: number;
  salary_estimate: string;
  missing_keywords: string[];
  key_changes: string[];
  optimized_cv: string;
  cover_letter: string;
  interview_questions: { question: string; tip: string }[];
};

type TrackerRow = {
  id: string;
  company: string;
  role: string;
  score_after: number | null;
  application_date: string;
  status: string;
  created_at: string;
};

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tolerant response parser for n8n / arbitrary webhook shapes. */
function normalizeAnalysis(raw: unknown): Analysis | null {
  if (!raw) return null;
  const container = raw as Record<string, unknown>;
  const unwrap = (o: unknown): Record<string, unknown> => {
    if (!o || typeof o !== "object") return {};
    const r = o as Record<string, unknown>;
    for (const k of ["json", "data", "result", "body", "output"]) {
      if (r[k] && typeof r[k] === "object") return unwrap(r[k]);
    }
    return r;
  };
  const d = unwrap(container);
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) if (d[k] !== undefined && d[k] !== null) return d[k];
    return undefined;
  };
  const toArr = (v: unknown): unknown[] =>
    Array.isArray(v) ? v : v == null ? [] : [v];
  const toStr = (v: unknown): string =>
    v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  const toNum = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/[^\d.-]/g, ""));
      return isNaN(n) ? 0 : n;
    }
    return 0;
  };

  const before = toNum(pick("score_before", "scoreBefore", "before_score", "beforeScore"));
  const after = toNum(pick("score_after", "scoreAfter", "after_score", "afterScore"));
  let boost = toNum(pick("improvement_percent", "improvementPercent", "boost"));
  if (!boost && before > 0 && after > 0) {
    boost = Math.round(((after - before) / before) * 100);
  }
  const salary = toStr(
    pick("salary_estimate", "salaryEstimate", "salary_range", "salaryRange", "salary"),
  );
  const keywords = toArr(pick("missing_keywords", "missingKeywords", "keywords")).map(
    toStr,
  );
  const changes = toArr(pick("key_changes", "keyChanges", "changes")).map(toStr);
  const cv = toStr(
    pick("optimized_cv", "optimizedCV", "optimizedCv", "rewritten_cv", "rewrittenCv"),
  );
  const cover = toStr(pick("cover_letter", "coverLetter", "letter"));
  const rawQs = toArr(pick("interview_questions", "interviewQuestions", "questions"));
  const questions = rawQs.map((q) => {
    if (typeof q === "string") return { question: q, tip: "" };
    const r = q as Record<string, unknown>;
    return {
      question: toStr(r.question ?? r.q ?? ""),
      tip: toStr(r.tip ?? r.advice ?? ""),
    };
  });

  if (!before && !after && !cv && !cover && questions.length === 0) return null;

  return {
    score_before: before,
    score_after: after,
    improvement_percent: boost,
    salary_estimate: salary,
    missing_keywords: keywords,
    key_changes: changes,
    optimized_cv: cv,
    cover_letter: cover,
    interview_questions: questions,
  };
}

async function postWithTimeout(url: string, body: unknown, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function ScoreCard({
  label,
  value,
  tint,
  emphasize = false,
}: {
  label: string;
  value: string;
  tint: "red" | "green" | "blue" | "gold";
  emphasize?: boolean;
}) {
  const bg =
    tint === "red"
      ? "var(--color-tint-red)"
      : tint === "green"
      ? "var(--color-tint-green)"
      : tint === "blue"
      ? "var(--color-tint-blue)"
      : "var(--color-tint-gold)";
  return (
    <div
      className="rounded-2xl p-5 flex flex-col justify-center"
      style={{
        background: bg,
        border: "1px solid rgba(18,51,31,0.06)",
        minHeight: emphasize ? 130 : 110,
      }}
    >
      <div className="small text-xs uppercase tracking-wider font-semibold mb-2">
        {label}
      </div>
      <div
        className="font-serif font-bold"
        style={{ fontSize: emphasize ? "2.5rem" : "2rem", lineHeight: 1 }}
      >
        {value}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* noop */
        }
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

function downloadPdf(title: string, sections: { heading: string; body: string }[]) {
  const w = window.open("", "_blank");
  if (!w) return;
  const html = `<!doctype html><html><head><title>${title}</title>
<style>
  @page { margin: 24mm; }
  body { font-family: Georgia, serif; color: #12331f; line-height: 1.55; }
  h1 { font-size: 22px; margin: 0 0 6px; color: #12331f; }
  h2 { font-size: 15px; margin: 22px 0 8px; color: #014c1f; border-bottom: 1px solid #d4a843; padding-bottom: 4px; }
  pre { font-family: Georgia, serif; white-space: pre-wrap; font-size: 12px; margin: 0; }
</style></head><body>
<h1>${title}</h1>
${sections
  .map(
    (s) =>
      `<h2>${s.heading}</h2><pre>${s.body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre>`,
  )
  .join("")}
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
  w.document.write(html);
  w.document.close();
}

function CopilotPage() {
  const genJd = useServerFn(generateJobDescription);
  const analyzeAi = useServerFn(analyzeApplication);

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [cv, setCv] = useState("");
  const [jd, setJd] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [genJdLoading, setGenJdLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [banner, setBanner] = useState<
    | { kind: "success"; msg: string }
    | { kind: "warn"; msg: string }
    | { kind: "error"; msg: string }
    | null
  >(null);
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadRows();
  }, []);

  async function loadRows() {
    const { data, error } = await supabase
      .from("job_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setRows(data as TrackerRow[]);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!company.trim()) e.company = "Company is required";
    if (!role.trim()) e.role = "Role is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!emailRe.test(email.trim())) e.email = "Enter a valid email";
    if (!cv.trim()) e.cv = "Paste your CV";
    if (!jd.trim()) e.jd = "Paste the job description";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleGenerateJd() {
    setGenJdLoading(true);
    try {
      const r = role.trim() || "Senior Product Manager";
      const { jobDescription } = await genJd({ data: { role: r } });
      setJd(jobDescription);
    } catch (err) {
      setBanner({
        kind: "error",
        msg: err instanceof Error ? err.message : "Failed to generate JD",
      });
    } finally {
      setGenJdLoading(false);
    }
  }

  async function handleOptimize() {
    if (!validate()) return;
    setAnalyzing(true);
    setAnalysis(null);
    setBanner(null);

    let result: Analysis | null = null;
    let source: "webhook" | "ai" = "ai";

    if (WEBHOOK_URL) {
      try {
        const raw = await postWithTimeout(
          WEBHOOK_URL,
          {
            cv,
            jobDescription: jd,
            company,
            role,
            email,
            date: new Date().toISOString(),
          },
          WEBHOOK_TIMEOUT_MS,
        );
        result = normalizeAnalysis(raw);
        if (result) source = "webhook";
      } catch {
        /* fallthrough to AI */
      }
    }

    if (!result) {
      try {
        result = await analyzeAi({
          data: { cv, jobDescription: jd, company, role },
        });
        source = "ai";
      } catch (err) {
        setBanner({
          kind: "error",
          msg:
            "Analysis failed: " +
            (err instanceof Error ? err.message : "Unknown error"),
        });
        setAnalyzing(false);
        return;
      }
    }

    setAnalysis(result);
    setBanner(
      !WEBHOOK_URL
        ? { kind: "warn", msg: "Webhook not connected yet — showing AI-generated preview." }
        : source === "webhook"
        ? { kind: "success", msg: "Live from your n8n backend ✓" }
        : {
            kind: "warn",
            msg:
              "Showing AI-generated preview — your n8n backend didn't respond. Check your workflow.",
          },
    );

    // Insert tracker row
    await supabase.from("job_applications").insert({
      company: company.trim(),
      role: role.trim(),
      score_after: Math.round(result.score_after),
      status: "Applied",
    });
    await loadRows();

    setAnalyzing(false);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  async function updateStatus(id: string, status: Status) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, status } : row)));
    await supabase.from("job_applications").update({ status }).eq("id", id);
  }

  const boostLabel = useMemo(() => {
    if (!analysis) return "";
    const sign = analysis.improvement_percent >= 0 ? "+" : "";
    return `${sign}${Math.round(analysis.improvement_percent)}%`;
  }, [analysis]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-6 pt-8 pb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl md:text-3xl font-bold">
            AI Job Application Co-pilot
          </h1>
          <span
            aria-hidden
            className="inline-block rounded-full"
            style={{ width: 10, height: 10, background: "var(--color-gold)" }}
          />
        </div>
        <p className="small text-sm md:text-base italic">
          Your personal application strategist
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-12 space-y-10">
        {/* Analyzer */}
        <section className="card-paper p-6 md:p-8">
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-2">
            Application Analyzer
          </h2>
          <p className="small text-sm md:text-base mb-6">
            Paste your CV and the job description. We'll tailor your application for
            this role.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Company Name" error={errors.company}>
              <input
                className={`field-input ${errors.company ? "field-error" : ""}`}
                placeholder="e.g. Acme Corp"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </Field>
            <Field label="Role / Job Title" error={errors.role}>
              <input
                className={`field-input ${errors.role ? "field-error" : ""}`}
                placeholder="e.g. Senior Product Manager"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </Field>
            <Field label="Your Email" error={errors.email}>
              <input
                type="email"
                className={`field-input ${errors.email ? "field-error" : ""}`}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <div />

            <Field label="Your Current CV" error={errors.cv} className="md:col-span-2">
              <textarea
                className={`field-input ${errors.cv ? "field-error" : ""}`}
                rows={10}
                placeholder="Paste the full text of your CV..."
                value={cv}
                onChange={(e) => setCv(e.target.value)}
              />
            </Field>

            <Field
              label="Job Description"
              error={errors.jd}
              className="md:col-span-2"
              labelRight={
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleGenerateJd}
                  disabled={genJdLoading}
                >
                  {genJdLoading ? "Generating…" : "Generate sample JD"}
                </button>
              }
            >
              <textarea
                className={`field-input ${errors.jd ? "field-error" : ""}`}
                rows={10}
                placeholder="Paste the job description you're applying for..."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </Field>
          </div>

          <button
            className="btn-primary mt-6 w-full md:w-auto md:min-w-[240px] flex items-center justify-center gap-2"
            onClick={handleOptimize}
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <Spinner /> Analyzing your CV…
              </>
            ) : (
              "Optimize Application"
            )}
          </button>
        </section>

        {/* Banner */}
        {banner && (
          <div
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{
              background:
                banner.kind === "success"
                  ? "var(--color-tint-green)"
                  : banner.kind === "warn"
                  ? "var(--color-tint-gold)"
                  : "var(--color-tint-red)",
              color: "var(--color-forest)",
              border: `1px solid ${
                banner.kind === "success"
                  ? "#7bb187"
                  : banner.kind === "warn"
                  ? "var(--color-gold)"
                  : "#c98a8a"
              }`,
            }}
          >
            {banner.msg}
          </div>
        )}

        {/* Results */}
        {analysis && (
          <section ref={resultsRef} className="space-y-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <ScoreCard
                label="Before Score"
                value={`${Math.round(analysis.score_before)}`}
                tint="red"
              />
              <ScoreCard
                label="After Score"
                value={`${Math.round(analysis.score_after)}`}
                tint="green"
                emphasize
              />
              <ScoreCard label="Boost" value={boostLabel} tint="blue" />
              <ScoreCard
                label="Est. Salary"
                value={analysis.salary_estimate || "—"}
                tint="gold"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="btn-primary"
                onClick={() =>
                  downloadPdf(`${role} — ${company}`, [
                    { heading: "Optimized CV", body: analysis.optimized_cv },
                    { heading: "Cover Letter", body: analysis.cover_letter },
                  ])
                }
              >
                Download Both (PDF)
              </button>
            </div>

            <Panel title="Keywords Addressed" copyText={analysis.missing_keywords.join(", ")}>
              {analysis.missing_keywords.length === 0 ? (
                <p className="small text-sm">No missing keywords identified.</p>
              ) : (
                <div className="flex flex-wrap">
                  {analysis.missing_keywords.map((k, i) => (
                    <span key={i} className="pill-gold">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Key Changes Made" copyText={analysis.key_changes.join("\n")}>
              <ul className="space-y-2">
                {analysis.key_changes.map((c, i) => (
                  <li key={i} className="flex gap-3">
                    <span style={{ color: "var(--color-forest-secondary)" }}>✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel
              title="Optimized CV"
              copyText={analysis.optimized_cv}
              extraActions={
                <button
                  className="btn-ghost"
                  onClick={() =>
                    downloadPdf(`Optimized CV — ${role}`, [
                      { heading: "Optimized CV", body: analysis.optimized_cv },
                    ])
                  }
                >
                  Download PDF
                </button>
              }
            >
              <pre className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed">
                {analysis.optimized_cv}
              </pre>
            </Panel>

            <Panel
              title="Cover Letter"
              copyText={analysis.cover_letter}
              extraActions={
                <button
                  className="btn-ghost"
                  onClick={() =>
                    downloadPdf(`Cover Letter — ${role}`, [
                      { heading: "Cover Letter", body: analysis.cover_letter },
                    ])
                  }
                >
                  Download PDF
                </button>
              }
            >
              <pre className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed">
                {analysis.cover_letter}
              </pre>
            </Panel>

            <Panel
              title="Interview Questions"
              copyText={analysis.interview_questions
                .map((q) => `Q: ${q.question}\nTip: ${q.tip}`)
                .join("\n\n")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysis.interview_questions.map((q, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-4"
                    style={{
                      background: "var(--color-tint-gold)",
                      border: "1px solid rgba(212,168,67,0.35)",
                    }}
                  >
                    <div className="font-serif font-semibold mb-2">{q.question}</div>
                    {q.tip && (
                      <div className="small text-sm leading-relaxed">
                        <span className="font-semibold">Tip: </span>
                        {q.tip}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        )}

        {/* Tracker */}
        <section className="card-paper p-6 md:p-8">
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-1">
            Application Tracker
          </h2>
          <p className="small text-sm mb-5">
            Every optimized application is saved here. Update statuses as you go.
          </p>

          {rows.length === 0 ? (
            <p className="small text-sm py-8 text-center">
              No applications yet — optimize your first one above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ color: "var(--color-forest-secondary)" }}
                  >
                    <th className="py-2 pr-4 font-semibold">Company</th>
                    <th className="py-2 pr-4 font-semibold">Role</th>
                    <th className="py-2 pr-4 font-semibold">Score</th>
                    <th className="py-2 pr-4 font-semibold">Date</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      style={{ borderTop: "1px solid var(--color-border)" }}
                    >
                      <td className="py-3 pr-4 font-medium">{r.company}</td>
                      <td className="py-3 pr-4">{r.role}</td>
                      <td className="py-3 pr-4">{r.score_after ?? "—"}</td>
                      <td className="py-3 pr-4">
                        {new Date(r.application_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        <select
                          value={r.status}
                          onChange={(e) =>
                            updateStatus(r.id, e.target.value as Status)
                          }
                          className="field-input py-1 px-2 text-sm"
                          style={{ width: "auto" }}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  error,
  children,
  className = "",
  labelRight,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  labelRight?: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-semibold">{label}</label>
        {labelRight}
      </div>
      {children}
      {error && (
        <p className="text-xs mt-1" style={{ color: "var(--color-destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Panel({
  title,
  children,
  copyText,
  extraActions,
}: {
  title: string;
  children: React.ReactNode;
  copyText: string;
  extraActions?: React.ReactNode;
}) {
  return (
    <div className="card-paper p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="font-serif text-xl font-semibold">{title}</h3>
        <div className="flex gap-2">
          {extraActions}
          <CopyButton text={copyText} />
        </div>
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block rounded-full animate-spin"
      style={{
        width: 16,
        height: 16,
        border: "2px solid rgba(255,255,255,0.35)",
        borderTopColor: "#ffffff",
      }}
    />
  );
}
