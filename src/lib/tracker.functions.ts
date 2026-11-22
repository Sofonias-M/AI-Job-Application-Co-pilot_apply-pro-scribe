import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ownerKey = z.string().uuid();
const statuses = ["Applied", "Reviewed", "Interviewing", "Offer", "Rejected"] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listApplications = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ownerKey }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows, error } = await db
      .from("job_applications")
      .select("id, company, role, score_after, application_date, status, created_at")
      .eq("owner_key", data.ownerKey)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load applications");
    return rows ?? [];
  });

export const addApplication = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        ownerKey,
        company: z.string().trim().min(1).max(200),
        role: z.string().trim().min(1).max(200),
        score_after: z.number().int().min(0).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("job_applications").insert({
      owner_key: data.ownerKey,
      company: data.company,
      role: data.role,
      score_after: data.score_after,
      status: "Applied",
    });
    if (error) throw new Error("Could not save application");
    return { ok: true };
  });

export const updateApplicationStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ ownerKey, id: z.string().uuid(), status: z.enum(statuses) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("job_applications")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("owner_key", data.ownerKey);
    if (error) throw new Error("Could not update status");
    return { ok: true };
  });
