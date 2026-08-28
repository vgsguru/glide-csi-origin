import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const QSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().min(4).max(2000),
  expectedSignal: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  companyId: z.string().uuid().nullable().optional(),
});

export const upsertQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => QSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      owner_id: context.userId,
      company_id: data.companyId ?? null,
      text: data.text,
      expected_signal: data.expectedSignal ?? null,
      tags: data.tags,
      difficulty: data.difficulty,
    };
    if (data.id) {
      const { error } = await context.supabase.from("question_bank").update(payload).eq("id", data.id).eq("owner_id", context.userId);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("question_bank").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("question_bank").delete().eq("id", data.id).eq("owner_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
