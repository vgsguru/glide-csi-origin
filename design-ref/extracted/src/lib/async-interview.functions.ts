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

function redactPII(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email redacted]")
    .replace(/\+?\d[\d\s\-().]{7,}\d/g, "[phone redacted]")
    .replace(/^(Name|Full Name|Candidate)[:\s].*$/gim, "[name redacted]");
}

// ----- Start an async interview: returns questions list and interview row -----
export const startAsyncInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: app } = await context.supabase
      .from("applications")
      .select("id, applicant_id, jobs ( id, title, interview_template_id, questions )")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found");
    if (app.applicant_id !== context.userId) throw new Error("Forbidden");
    const job = app.jobs as unknown as { id: string; title: string; interview_template_id: string | null; questions: string[] | null };

    // resolve question list
    let questions: string[] = [];
    if (job.interview_template_id) {
      const { data: rows } = await context.supabase
        .from("interview_template_questions")
        .select("position, text_override, question_bank ( text )")
        .eq("template_id", job.interview_template_id)
        .order("position", { ascending: true });
      questions = (rows ?? []).map((r) => {
        const q = r.question_bank as unknown as { text: string } | null;
        return r.text_override || q?.text || "";
      }).filter(Boolean);
    }
    if (questions.length === 0 && job.questions) {
      questions = job.questions.filter((q: string) => q && q.trim().length > 0);
    }
    if (questions.length === 0) {
      questions = [
        `Tell us why you're interested in the ${job.title} role.`,
        `Walk us through a project that best demonstrates the skills required.`,
        `What's the hardest problem you've solved recently?`,
      ];
    }

    const { data: existing } = await context.supabase
      .from("interviews").select("id").eq("application_id", data.applicationId).maybeSingle();
    let interviewId: string;
    if (existing) {
      interviewId = existing.id;
      await context.supabase.from("interviews").update({
        mode: "async",
        started_at: new Date().toISOString(),
        answers: questions.map((q) => ({ q, video_url: null, transcript: null })),
      }).eq("id", interviewId);
    } else {
      const { data: created, error } = await context.supabase.from("interviews").insert({
        application_id: data.applicationId,
        started_at: new Date().toISOString(),
        mode: "async",
        answers: questions.map((q) => ({ q, video_url: null, transcript: null })),
      }).select("id").single();
      if (error) throw error;
      interviewId = created.id;
    }
    await context.supabase.from("applications").update({
      interview_mode: "async",
      status: "interview_in_progress",
    }).eq("id", data.applicationId);
    return { interviewId, questions };
  });

// ----- Save a single answer (video uploaded by client to storage; transcript optional) -----
export const saveAsyncAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    interviewId: z.string().uuid(),
    index: z.number().int().min(0).max(50),
    videoPath: z.string().min(1),
    transcript: z.string().max(8000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: iv } = await context.supabase
      .from("interviews")
      .select("id, answers, application_id, applications!inner ( applicant_id )")
      .eq("id", data.interviewId)
      .maybeSingle();
    if (!iv) throw new Error("Interview not found");
    if ((iv.applications as unknown as { applicant_id: string }).applicant_id !== context.userId) throw new Error("Forbidden");

    const answers = Array.isArray(iv.answers) ? [...(iv.answers as Array<{ q: string; video_url: string | null; transcript: string | null }>)] : [];
    if (data.index >= answers.length) throw new Error("Index out of range");
    answers[data.index] = {
      ...answers[data.index],
      video_url: data.videoPath,
      transcript: data.transcript ?? answers[data.index]?.transcript ?? null,
    };
    const { error } = await context.supabase.from("interviews").update({ answers }).eq("id", data.interviewId);
    if (error) throw error;
    return { ok: true };
  });

// ----- Finalize async interview: scores, summary, evidence (mirrors live finishInterview) -----
export const finalizeAsyncInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ interviewId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: iv } = await context.supabase
      .from("interviews")
      .select("id, application_id, answers, applications!inner ( applicant_id )")
      .eq("id", data.interviewId)
      .maybeSingle();
    if (!iv) throw new Error("Interview not found");
    if ((iv.applications as unknown as { applicant_id: string }).applicant_id !== context.userId) throw new Error("Forbidden");

    const answers = Array.isArray(iv.answers) ? (iv.answers as Array<{ q: string; video_url: string | null; transcript: string | null }>) : [];
    if (answers.length === 0) throw new Error("No answers");
    const transcript = answers.map((a) => ({ q: a.q, a: a.transcript ?? "(no transcript provided)" }));

    const { data: app } = await context.supabase
      .from("applications")
      .select("id, resume_text, intro_transcript, jobs ( title, description, ideal_profile, rubric )")
      .eq("id", iv.application_id)
      .single();
    if (!app) throw new Error("Application not found");
    const job = app.jobs as unknown as { title: string; description: string; ideal_profile: string; rubric: Record<string, number> };

    const grading = await chat("google/gemini-3-flash-preview", {
      messages: [
        { role: "system", content: `You are an expert, impartial interviewer reviewing an async video interview. Score each rubric criterion 0-100 with verbatim evidence citations. Output STRICT JSON: { "scores": { "<criterion>": number }, "evidence": { "<criterion>": { "justification": string, "citations": [ { "source": "resume" | "intro" | "interview", "quote": string } ] } }, "total": number, "summary": string, "strengths": string[], "concerns": string[], "recommendation": "Strong hire" | "Hire" | "Maybe" | "No hire" }` },
        { role: "user", content: `Job: ${job.title}\n${job.description}\nIdeal: ${job.ideal_profile ?? ""}\nRubric weights: ${JSON.stringify(job.rubric)}\n\nResume:\n${redactPII(app.resume_text)}\n\nIntro:\n${redactPII(app.intro_transcript)}\n\nInterview answers:\n${transcript.map((t) => `Q: ${t.q}\nA: ${t.a}`).join("\n\n")}` },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = extractJson<{ scores: Record<string, number>; evidence?: Record<string, { justification: string; citations: Array<{ source: string; quote: string }> }>; total: number; summary: string; strengths: string[]; concerns: string[]; recommendation: string }>(grading.choices[0].message.content);

    await context.supabase.from("interviews").update({
      transcript,
      ended_at: new Date().toISOString(),
    }).eq("id", data.interviewId);

    await context.supabase.from("applications").update({
      status: "scored",
      score: parsed.total,
      score_breakdown: parsed.scores,
      score_evidence: parsed.evidence ?? {},
      ai_summary: parsed.summary,
      ai_highlights: { strengths: parsed.strengths ?? [], concerns: parsed.concerns ?? [], recommendation: parsed.recommendation ?? "" },
      pipeline_status: "interviewed",
    }).eq("id", iv.application_id);

    return { ok: true, total: parsed.total };
  });

// Transcribe an answer audio/video without persisting to applications
export const transcribeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    interviewId: z.string().uuid(),
    audioBase64: z.string(),
    mime: z.string(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    // verify ownership
    const { data: iv } = await context.supabase.from("interviews").select("id, applications!inner ( applicant_id )").eq("id", data.interviewId).maybeSingle();
    if (!iv) throw new Error("Interview not found");
    if ((iv.applications as unknown as { applicant_id: string }).applicant_id !== context.userId) throw new Error("Forbidden");
    const result = await chat("google/gemini-3-flash-preview", {
      messages: [
        { role: "system", content: "Transcribe the user's spoken answer into plain text. Output only the transcript." },
        { role: "user", content: [{ type: "text", text: "Transcribe this answer." }, { type: "input_audio", input_audio: { data: data.audioBase64, format: data.mime.includes("mp4") ? "m4a" : "webm" } }] },
      ],
    });
    return { transcript: result.choices[0]?.message?.content?.trim() ?? "" };
  });
