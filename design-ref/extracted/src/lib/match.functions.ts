import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims

async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const truncated = text.slice(0, 8000);
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({ model: EMBED_MODEL, input: truncated }),
  });
  if (!res.ok) throw new Error(`Embed error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

// pgvector wants the string form '[0.1,0.2,...]' when going through the JS client
function toVecLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

// ----- Embed a job (recruiter owns it) -----
export const embedJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("id, title, description, ideal_profile, location, employment_type, companies ( name, owner_id )")
      .eq("id", data.jobId)
      .single();
    if (error || !job) throw new Error("Job not found");
    const company = job.companies as unknown as { owner_id: string } | null;
    if (!company || company.owner_id !== context.userId) throw new Error("Forbidden");
    const text = [job.title, job.description, job.ideal_profile, job.location, job.employment_type]
      .filter(Boolean).join("\n\n");
    const vec = await embed(text);
    const { error: upErr } = await context.supabase
      .from("jobs")
      .update({ embedding: toVecLiteral(vec), embedding_text: text, embedding_updated_at: new Date().toISOString() })
      .eq("id", data.jobId);
    if (upErr) throw upErr;
    return { ok: true };
  });

// ----- Embed an applicant profile (self) -----
export const embedMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ resumeText: z.string().min(1).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    let resumeText = data.resumeText;
    if (!resumeText) {
      // fall back to the most recent application's parsed resume_text
      const { data: app } = await context.supabase
        .from("applications")
        .select("resume_text")
        .eq("applicant_id", context.userId)
        .not("resume_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      resumeText = app?.resume_text ?? "";
    }
    if (!resumeText) return { ok: false, reason: "no_resume" };
    const vec = await embed(resumeText);
    const { error } = await context.supabase
      .from("profiles")
      .update({
        resume_text: resumeText,
        embedding: toVecLiteral(vec),
        embedding_updated_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

// ----- Request company verification -----
export const requestCompanyVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    companyId: z.string().uuid(),
    domain: z.string().max(200).optional(),
    evidenceUrl: z.string().url().max(500).optional(),
    notes: z.string().max(1000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("company_verifications")
      .select("id, status")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && existing.status === "pending") throw new Error("A verification request is already pending");

    const { error } = await context.supabase.from("company_verifications").insert({
      company_id: data.companyId,
      requested_by: context.userId,
      domain: data.domain ?? null,
      evidence_url: data.evidenceUrl ?? null,
      notes: data.notes ?? null,
      status: "pending",
    });
    if (error) throw error;
    await context.supabase
      .from("companies")
      .update({ verification_status: "pending" })
      .eq("id", data.companyId)
      .eq("owner_id", context.userId);
    return { ok: true };
  });

// ----- Admin decides a verification -----
export const decideCompanyVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    verificationId: z.string().uuid(),
    approve: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const status = data.approve ? "verified" : "rejected";
    const { data: row, error } = await context.supabase
      .from("company_verifications")
      .update({ status, decided_by: context.userId, decided_at: new Date().toISOString() })
      .eq("id", data.verificationId)
      .select("company_id")
      .single();
    if (error) throw error;
    await context.supabase
      .from("companies")
      .update({
        verification_status: status,
        verified_at: data.approve ? new Date().toISOString() : null,
      })
      .eq("id", row.company_id);
    return { ok: true, status };
  });

// ----- Bulk update application pipeline stage -----
export const bulkUpdateApplicationStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    applicationIds: z.array(z.string().uuid()).min(1).max(200),
    stage: z.enum(["applied", "interviewed", "shortlisted", "offer", "rejected"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: affected, error } = await context.supabase.rpc("bulk_update_pipeline", {
      _application_ids: data.applicationIds,
      _new_status: data.stage,
    });
    if (error) throw error;
    return { ok: true, affected: affected ?? 0 };
  });
