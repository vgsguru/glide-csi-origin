import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TemplateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  rubric: z.record(z.string(), z.number().min(0).max(100)).default({}),
  companyId: z.string().uuid().nullable().optional(),
});

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TemplateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      owner_id: context.userId,
      name: data.name,
      description: data.description ?? null,
      rubric: data.rubric,
      company_id: data.companyId ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("interview_templates").update(payload).eq("id", data.id).eq("owner_id", context.userId);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("interview_templates").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("interview_templates").delete().eq("id", data.id).eq("owner_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const attachQuestionToTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    templateId: z.string().uuid(),
    questionId: z.string().uuid().optional(),
    textOverride: z.string().max(2000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    // verify ownership
    const { data: t } = await context.supabase.from("interview_templates").select("id, owner_id").eq("id", data.templateId).maybeSingle();
    if (!t || t.owner_id !== context.userId) throw new Error("Forbidden");
    const { data: last } = await context.supabase.from("interview_template_questions").select("position").eq("template_id", data.templateId).order("position", { ascending: false }).limit(1).maybeSingle();
    const nextPos = (last?.position ?? -1) + 1;
    const { error } = await context.supabase.from("interview_template_questions").insert({
      template_id: data.templateId,
      question_id: data.questionId ?? null,
      text_override: data.textOverride ?? null,
      position: nextPos,
    });
    if (error) throw error;
    return { ok: true };
  });

export const detachQuestionFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("interview_template_questions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const setJobInterviewTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    jobId: z.string().uuid(),
    templateId: z.string().uuid().nullable(),
    mode: z.enum(["async", "live"]).default("async"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    // verify recruiter owns this job
    const { data: job } = await context.supabase.from("jobs").select("id, companies ( owner_id )").eq("id", data.jobId).maybeSingle();
    const owner = (job?.companies as unknown as { owner_id: string } | null)?.owner_id;
    if (!owner || owner !== context.userId) throw new Error("Forbidden");
    const { error } = await context.supabase.from("jobs").update({
      interview_template_id: data.templateId,
      interview_mode: data.mode,
    }).eq("id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });
