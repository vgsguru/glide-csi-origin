import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const LOVABLE_AIG = "https://ai.gateway.lovable.dev/v1";

async function chat(model: string, body: Record<string, unknown>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(`${LOVABLE_AIG}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({ model, ...body }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ choices: Array<{ message: { content: string } }> }>;
}

function extractJson<T>(text: string): T {
  const m = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/```\s*([\s\S]*?)```/);
  return JSON.parse(m ? m[1] : text) as T;
}

export type ResumeMatch = {
  matched_skills: string[];
  gaps: string[];
  extras: string[];
  overall_pct: number;
  summary: string;
};

export const computeResumeMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: app } = await context.supabase
      .from("applications")
      .select("id, applicant_id, resume_text, jobs ( title, description, ideal_profile, companies ( owner_id ) )")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found");

    // applicant OR recruiter who owns the company can compute
    const job = app.jobs as unknown as { title: string; description: string; ideal_profile: string | null; companies: { owner_id: string } | null };
    const ownerId = job?.companies?.owner_id;
    if (app.applicant_id !== context.userId && ownerId !== context.userId) throw new Error("Forbidden");

    if (!app.resume_text) throw new Error("No parsed resume yet");

    const grading = await chat("google/gemini-3-flash-preview", {
      messages: [
        { role: "system", content: `You compare a candidate's parsed resume against the role's expectations. Output STRICT JSON:
{
  "matched_skills": ["short phrase referenced in BOTH"],
  "gaps": ["expectation NOT clearly supported by resume"],
  "extras": ["resume strength not asked for but valuable"],
  "overall_pct": 0-100,
  "summary": "1-2 sentence neutral overview"
}` },
        { role: "user", content: `ROLE: ${job.title}\n\nDESCRIPTION:\n${job.description}\n\nIDEAL CANDIDATE:\n${job.ideal_profile ?? "(none provided)"}\n\nPARSED RESUME:\n${app.resume_text.slice(0, 6000)}` },
      ],
      response_format: { type: "json_object" },
    });
    const match = extractJson<ResumeMatch>(grading.choices[0].message.content);
    await context.supabase.from("applications").update({ resume_match: match }).eq("id", data.applicationId);
    return match;
  });

export const getApplicationPercentile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: pct } = await context.supabase.rpc("application_percentile", { _application_id: data.applicationId });
    return { percentile: pct as number | null };
  });
