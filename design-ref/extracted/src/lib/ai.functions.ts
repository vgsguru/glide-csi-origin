import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const LOVABLE_AIG = "https://ai.gateway.lovable.dev/v1";
const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";

async function chat(model: string, body: Record<string, unknown>) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(`${LOVABLE_AIG}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "lumen-app" },
    body: JSON.stringify({ model, ...body }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ choices: Array<{ message: { content: string; images?: Array<{ image_url: { url: string } }> } }> }>;
}

function extractJson<T>(text: string): T {
  const m = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/```\s*([\s\S]*?)```/);
  const raw = m ? m[1] : text;
  return JSON.parse(raw) as T;
}

async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) return { skipped: true };
  try {
    const res = await fetch(`${RESEND_GATEWAY}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: "Lumen <onboarding@resend.dev>",
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) console.error("Resend failed:", res.status, await res.text().catch(() => ""));
    return { sent: res.ok };
  } catch (e) {
    console.error("Email send error:", e);
    return { error: true };
  }
}

// ----- Parse resume PDF -----
export const parseResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid(), pdfBase64: z.string(), mime: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await chat("google/gemini-3-flash-preview", {
      messages: [
        { role: "system", content: "Extract a clean plain-text summary of this resume. Keep: name, contact, summary, work history (role, company, dates, bullets), education, skills. Output PLAIN TEXT only, no JSON, no markdown." },
        { role: "user", content: [{ type: "text", text: "Extract this resume." }, { type: "file", file: { filename: "resume.pdf", file_data: `data:${data.mime};base64,${data.pdfBase64}` } }] },
      ],
    });
    const resumeText = result.choices[0]?.message?.content?.trim() ?? "";
    await context.supabase.from("applications").update({ resume_text: resumeText }).eq("id", data.applicationId);
    return { resumeText };
  });

// ----- Transcribe intro video -----
export const transcribeIntro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid(), audioBase64: z.string(), mime: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await chat("google/gemini-3-flash-preview", {
      messages: [
        { role: "system", content: "Transcribe the user's spoken pitch into plain text. Output only the transcript." },
        { role: "user", content: [{ type: "text", text: "Transcribe this pitch." }, { type: "input_audio", input_audio: { data: data.audioBase64, format: data.mime.includes("mp4") ? "m4a" : "webm" } }] },
      ],
    });
    const transcript = result.choices[0]?.message?.content?.trim() ?? "";
    await context.supabase.from("applications").update({ intro_transcript: transcript, status: "video_uploaded" }).eq("id", data.applicationId);
    return { transcript };
  });

// ----- Generate interview questions -----
export const startInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: app } = await context.supabase
      .from("applications")
      .select("id, resume_text, intro_transcript, jobs ( title, description, ideal_profile, questions )")
      .eq("id", data.applicationId).single();
    if (!app) throw new Error("Application not found");
    const job = app.jobs as unknown as { title: string; description: string; ideal_profile: string; questions: string[] };
    const recruiterQs: string[] = Array.isArray(job?.questions) ? job.questions.filter(Boolean) : [];

    const ai = await chat("google/gemini-3-flash-preview", {
      messages: [
        { role: "system", content: "You generate 3 short interview questions personalized to a candidate's resume and intro pitch for the given job. Output JSON: {\"questions\": string[]}. No extra prose. IMPORTANT: do not reference the candidate's name, gender, age, or personal identifiers — keep questions focused on skills, experience, and motivation only." },
        { role: "user", content: `Job: ${job?.title}\nDescription: ${job?.description}\nIdeal: ${job?.ideal_profile ?? ""}\n\nResume:\n${app.resume_text ?? ""}\n\nIntro pitch:\n${app.intro_transcript ?? ""}` },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = extractJson<{ questions: string[] }>(ai.choices[0].message.content);
    const allQs = [...recruiterQs, ...parsed.questions].slice(0, 8);

    const { data: existing } = await context.supabase
      .from("interviews").select("id").eq("application_id", data.applicationId).maybeSingle();
    let interviewId: string;
    if (existing) {
      interviewId = existing.id;
      await context.supabase.from("interviews").update({ started_at: new Date().toISOString() }).eq("id", interviewId);
    } else {
      const { data: interview, error } = await context.supabase.from("interviews").insert({
        application_id: data.applicationId, started_at: new Date().toISOString(),
      }).select("id").single();
      if (error) throw error;
      interviewId = interview.id;
    }

    await context.supabase.from("applications").update({ status: "interview_in_progress" }).eq("id", data.applicationId);
    return { interviewId, questions: allQs };
  });

// Strip personal identifiers before sending to AI for scoring (bias guardrail)
function redactPII(text: string | null | undefined): string {
  if (!text) return "";
  // Strip email addresses, phone numbers, and very common name patterns at line starts
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email redacted]")
    .replace(/\+?\d[\d\s\-().]{7,}\d/g, "[phone redacted]")
    .replace(/^(Name|Full Name|Candidate)[:\s].*$/gim, "[name redacted]");
}

// ----- Submit final interview, transcript and snapshots, then score -----
export const finishInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    interviewId: z.string().uuid(),
    transcript: z.array(z.object({ q: z.string(), a: z.string() })),
    snapshots: z.array(z.string()).optional(),
    flags: z.array(z.string()).optional(),
    videoUrl: z.string().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: interview } = await context.supabase
      .from("interviews").select("application_id").eq("id", data.interviewId).single();
    if (!interview) throw new Error("Interview not found");

    await context.supabase.from("interviews").update({
      transcript: data.transcript, snapshots: data.snapshots ?? [], flags: data.flags ?? [],
      video_url: data.videoUrl, ended_at: new Date().toISOString(),
    }).eq("id", data.interviewId);

    const { data: app } = await context.supabase
      .from("applications")
      .select("id, resume_text, intro_transcript, applicant_id, jobs ( id, title, description, ideal_profile, rubric, company_id, companies ( name, owner_id ) )")
      .eq("id", interview.application_id).single();
    if (!app) throw new Error("Application not found");
    const job = app.jobs as unknown as { id: string; title: string; description: string; ideal_profile: string; rubric: Record<string, number>; company_id: string; companies: { name: string; owner_id: string } };

    const grading = await chat("google/gemini-3-flash-preview", {
      messages: [
        { role: "system", content: `You are an expert, impartial interviewer. Score the candidate against each rubric criterion (0-100) and compute a weighted total (0-100). Be fair and evidence-based; never infer demographic info. For EVERY criterion, cite 1-3 short verbatim quotes from the resume, intro pitch, or interview transcript that justify the score. Output STRICT JSON only:
{
  "scores": { "<criterion>": number },
  "evidence": { "<criterion>": { "justification": "1-2 sentence rationale", "citations": [ { "source": "resume" | "intro" | "interview", "quote": "verbatim snippet, <= 200 chars" } ] } },
  "total": number,
  "summary": "2-3 sentence neutral overview",
  "strengths": ["bullet", "bullet", "bullet"],
  "concerns": ["bullet", "bullet"],
  "recommendation": "Strong hire | Hire | Maybe | No hire"
}` },
        { role: "user", content: `Job: ${job.title}\n${job.description}\nIdeal: ${job.ideal_profile ?? ""}\nRubric weights: ${JSON.stringify(job.rubric)}\n\nResume:\n${redactPII(app.resume_text)}\n\nIntro:\n${redactPII(app.intro_transcript)}\n\nInterview transcript:\n${data.transcript.map((t) => `Q: ${t.q}\nA: ${t.a}`).join("\n\n")}` },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = extractJson<{ scores: Record<string, number>; evidence?: Record<string, { justification: string; citations: Array<{ source: string; quote: string }> }>; total: number; summary: string; strengths: string[]; concerns: string[]; recommendation: string }>(grading.choices[0].message.content);

    await context.supabase.from("applications").update({
      status: "scored",
      score: parsed.total,
      score_breakdown: parsed.scores,
      score_evidence: parsed.evidence ?? {},
      ai_summary: parsed.summary,
      ai_highlights: { strengths: parsed.strengths ?? [], concerns: parsed.concerns ?? [], recommendation: parsed.recommendation ?? "" },
      pipeline_status: "interviewed",
    }).eq("id", interview.application_id);


    // Fire-and-forget emails (don't block the response)
    try {
      const { data: applicantUser } = await context.supabase.from("profiles").select("full_name").eq("id", app.applicant_id).maybeSingle();
      const { data: { user: authUser } } = await context.supabase.auth.getUser();
      const applicantEmail = authUser?.email;
      if (applicantEmail) {
        await sendEmail({
          to: applicantEmail,
          subject: `Your Lumen interview for ${job.title} is scored`,
          html: `<div style="font-family:ui-sans-serif,Inter,Arial;background:#fafafa;padding:32px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:24px;padding:32px;border:1px solid #eee"><h1 style="font-size:24px;margin:0 0 12px">Interview complete</h1><p style="color:#555;line-height:1.6">Hi ${applicantUser?.full_name ?? "there"}, your interview for <b>${job.title}</b> at <b>${job.companies?.name ?? "the company"}</b> has been scored.</p><div style="margin:24px 0;padding:20px;background:#f5f5f5;border-radius:16px;text-align:center"><div style="font-size:44px;font-weight:700">${parsed.total.toFixed(0)}<span style="font-size:18px;color:#888">/100</span></div><p style="margin:8px 0 0;color:#666;font-size:13px">${parsed.recommendation}</p></div><p style="color:#555;line-height:1.6;font-size:14px">${parsed.summary}</p><p style="color:#999;font-size:12px;margin-top:24px">— The Lumen team</p></div></div>`,
        });
      }
      const { data: ownerAuth } = await context.supabase.from("profiles").select("id, full_name").eq("id", job.companies?.owner_id).maybeSingle();
      if (ownerAuth) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ownerInfo } = await supabaseAdmin.auth.admin.getUserById(ownerAuth.id);
        const recruiterEmail = ownerInfo.user?.email;
        if (recruiterEmail) {
          await sendEmail({
            to: recruiterEmail,
            subject: `New candidate scored ${parsed.total.toFixed(0)}/100 for ${job.title}`,
            html: `<div style="font-family:ui-sans-serif,Inter,Arial;background:#fafafa;padding:32px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:24px;padding:32px;border:1px solid #eee"><h1 style="font-size:24px;margin:0 0 12px">New candidate</h1><p style="color:#555;line-height:1.6">A candidate has completed the AI interview for <b>${job.title}</b>.</p><div style="margin:24px 0;padding:20px;background:#f5f5f5;border-radius:16px;text-align:center"><div style="font-size:44px;font-weight:700">${parsed.total.toFixed(0)}<span style="font-size:18px;color:#888">/100</span></div><p style="margin:8px 0 0;color:#666;font-size:13px">${parsed.recommendation}</p></div><p style="color:#555;line-height:1.6;font-size:14px">${parsed.summary}</p><p style="color:#999;font-size:12px;margin-top:24px">Open your Lumen dashboard to review the full transcript.</p></div></div>`,
          });
        }
      }
    } catch (e) {
      console.error("notify error", e);
    }

    return { score: parsed.total, summary: parsed.summary, breakdown: parsed.scores, highlights: { strengths: parsed.strengths, concerns: parsed.concerns, recommendation: parsed.recommendation } };
  });

// ----- Update application pipeline stage -----
export const setPipelineStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    applicationId: z.string().uuid(),
    stage: z.enum(["applied", "interviewed", "shortlisted", "offer", "rejected"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("applications").update({ pipeline_status: data.stage }).eq("id", data.applicationId);
    if (error) throw error;
    return { ok: true };
  });

// ----- Generate cover/OG image for a job -----
export const generateJobOgImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase
      .from("jobs")
      .select("id, title, ideal_profile, description, companies ( name )")
      .eq("id", data.jobId).maybeSingle();
    if (!job) throw new Error("Job not found");
    const company = (job.companies as unknown as { name: string } | null)?.name ?? "";

    const prompt = `1200x630 social cover image for a job posting. Editorial, minimal, premium, black & white aesthetic with subtle gradient and abstract geometric shapes. The image must clearly display the job title "${job.title}" as the dominant headline in bold modern sans-serif typography, with "${company}" as a smaller subtitle. No people, no logos other than the title text. Clean composition with generous whitespace, suitable as a LinkedIn share preview.`;

    const result = await chat("google/gemini-2.5-flash-image", {
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      modalities: ["image", "text"],
    });
    const dataUrl = result.choices[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("Image not generated");
    const m = dataUrl.match(/^data:(image\/[\w+]+);base64,(.+)$/);
    if (!m) throw new Error("Bad image data URL");
    const mime = m[1];
    const ext = mime.split("/")[1].split("+")[0];
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const path = `${data.jobId}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage.from("og-images").upload(path, bytes, { upsert: true, contentType: mime });
    if (upErr) throw upErr;

    const publicUrl = `/api/public/og/jobs/${data.jobId}.${ext}`;
    await context.supabase.from("jobs").update({ og_image_url: publicUrl }).eq("id", data.jobId);
    return { url: publicUrl };
  });

// ----- Grant or revoke a retake (recruiter) -----
export const setRetakeAllowed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    applicationId: z.string().uuid(),
    allowed: z.boolean(),
    note: z.string().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify the caller owns the company that posted this job
    const { data: app } = await context.supabase
      .from("applications")
      .select("id, retake_count, audit_log, jobs ( companies ( owner_id ) )")
      .eq("id", data.applicationId).maybeSingle();
    if (!app) throw new Error("Application not found");
    const ownerId = (app.jobs as unknown as { companies: { owner_id: string } } | null)?.companies?.owner_id;
    if (ownerId !== context.userId) throw new Error("Forbidden");
    if (data.allowed && (app.retake_count ?? 0) >= 1) {
      throw new Error("Candidate has already used their retake");
    }
    const entry = {
      at: new Date().toISOString(),
      by: context.userId,
      action: data.allowed ? "retake_granted" : "retake_revoked",
      note: data.note ?? null,
    };
    const log = Array.isArray(app.audit_log) ? app.audit_log : [];
    const { error } = await context.supabase.from("applications").update({
      retake_allowed: data.allowed,
      audit_log: [...log, entry],
    }).eq("id", data.applicationId);
    if (error) throw error;
    return { ok: true };
  });

// ----- Consume a retake (applicant): resets interview state -----
export const consumeRetake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: app } = await context.supabase
      .from("applications")
      .select("id, applicant_id, retake_allowed, retake_count, audit_log")
      .eq("id", data.applicationId).maybeSingle();
    if (!app) throw new Error("Application not found");
    if (app.applicant_id !== context.userId) throw new Error("Forbidden");
    if (!app.retake_allowed) throw new Error("Retake is not enabled for this application");
    if ((app.retake_count ?? 0) >= 1) throw new Error("Retake already used");

    // Clear the existing interview so the applicant can run it again
    await context.supabase.from("interviews").delete().eq("application_id", data.applicationId);
    const entry = {
      at: new Date().toISOString(),
      by: context.userId,
      action: "retake_consumed",
    };
    const log = Array.isArray(app.audit_log) ? app.audit_log : [];
    const { error } = await context.supabase.from("applications").update({
      retake_allowed: false,
      retake_count: (app.retake_count ?? 0) + 1,
      status: "video_uploaded",
      score: null,
      score_breakdown: null,
      score_evidence: null,
      ai_summary: null,
      ai_highlights: null,
      audit_log: [...log, entry],
    }).eq("id", data.applicationId);
    if (error) throw error;
    return { ok: true };
  });

// Assign the recruiter role to the calling user. Only allowed if the user
// currently has no role rows (i.e. fresh signup). Uses service role because
// the user_roles INSERT policy intentionally blocks self-assignment of
// privileged roles. Rate-limited per IP and logged to role_audit.
const RECRUITER_RATE_LIMIT = 5; // attempts
const RECRUITER_RATE_WINDOW_MIN = 60; // minutes

export const assignRecruiterRoleOnSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getRequest, getRequestIP, getRequestHeader } = await import("@tanstack/react-start/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let ip: string | undefined;
    let userAgent: string | undefined;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? getRequest().headers.get("cf-connecting-ip") ?? undefined;
      userAgent = getRequestHeader("user-agent") ?? undefined;
    } catch { /* not in request context */ }

    // Ad-hoc per-IP rate limit
    if (ip) {
      const since = new Date(Date.now() - RECRUITER_RATE_WINDOW_MIN * 60_000).toISOString();
      const { count } = await supabaseAdmin
        .from("recruiter_signup_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", since);
      if ((count ?? 0) >= RECRUITER_RATE_LIMIT) {
        throw new Error("Too many recruiter signup attempts. Try again later.");
      }
      await supabaseAdmin.from("recruiter_signup_attempts").insert({ ip, user_id: context.userId });
    }

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .limit(1);
    if (selErr) throw selErr;
    if (existing && existing.length > 0) {
      throw new Error("Role already assigned");
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "recruiter" });
    if (error) throw error;

    // Best-effort audit log
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    await supabaseAdmin.from("role_audit").insert({
      user_id: context.userId,
      email,
      role: "recruiter",
      source: "signup",
      ip: ip ?? null,
      user_agent: userAgent ?? null,
    });

    return { ok: true };
  });



