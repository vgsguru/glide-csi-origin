import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";

function renderTemplate(tpl: string, vars: Record<string, string | undefined>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, key) => vars[key] ?? "");
}

function mdToHtml(md: string): string {
  // very small markdown subset: paragraphs + line breaks + bold + links
  const escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const withLinks = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#111;text-decoration:underline">$1</a>');
  const withBold = withLinks.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  return withBold.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, "<br/>")}</p>`).join("");
}

function emailShell(subject: string, htmlBody: string): string {
  return `<div style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,Inter,Arial;background:#fafafa;padding:32px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:24px;padding:36px;border:1px solid #eee"><h1 style="font-size:22px;margin:0 0 18px;font-weight:600">${subject}</h1>${htmlBody}<p style="color:#999;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:14px">Sent via Lumen</p></div></div>`;
}

export const upsertMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(2).max(120),
    kind: z.enum(["invite", "reject", "next_steps", "custom"]).default("custom"),
    subject: z.string().min(2).max(200),
    bodyMd: z.string().min(2).max(8000),
    companyId: z.string().uuid().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      owner_id: context.userId,
      name: data.name,
      kind: data.kind,
      subject: data.subject,
      body_md: data.bodyMd,
      company_id: data.companyId ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("message_templates").update(payload).eq("id", data.id).eq("owner_id", context.userId);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("message_templates").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("message_templates").delete().eq("id", data.id).eq("owner_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const seedDefaultTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase.from("message_templates").select("id", { count: "exact", head: true }).eq("owner_id", context.userId);
    if ((count ?? 0) > 0) return { ok: true, seeded: 0 };
    const defaults = [
      {
        name: "Interview invitation",
        kind: "invite" as const,
        subject: "You're invited to interview for {{job_title}} at {{company_name}}",
        body_md: "Hi {{candidate_name}},\n\nWe loved your application for **{{job_title}}**. We'd like to invite you to the next stage.\n\nPlease reply to this email with your availability for a 30-minute call this week.\n\nThanks,\n{{recruiter_name}}",
      },
      {
        name: "Not moving forward",
        kind: "reject" as const,
        subject: "Update on your application for {{job_title}}",
        body_md: "Hi {{candidate_name}},\n\nThank you for applying to **{{job_title}}** at {{company_name}}. After careful review we won't be moving forward at this time.\n\nWe truly appreciate the time you put into your application, and we wish you the best in your search.\n\nWarm regards,\n{{recruiter_name}}",
      },
      {
        name: "Next steps",
        kind: "next_steps" as const,
        subject: "Next steps for {{job_title}}",
        body_md: "Hi {{candidate_name}},\n\nGreat news — you're moving forward to the next round for **{{job_title}}**. We'll be in touch shortly with logistics.\n\nReply if you have any questions.\n\n{{recruiter_name}}",
      },
    ];
    const rows = defaults.map((d) => ({ ...d, owner_id: context.userId }));
    const { error } = await context.supabase.from("message_templates").insert(rows);
    if (error) throw error;
    return { ok: true, seeded: rows.length };
  });

// ----- Bulk notify -----
const RATE_LIMIT = 100; // per hour
export const bulkNotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    applicationIds: z.array(z.string().uuid()).min(1).max(50),
    channel: z.enum(["email", "inapp", "both"]),
    templateId: z.string().uuid().optional(),
    subject: z.string().min(2).max(200).optional(),
    bodyMd: z.string().min(2).max(8000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    // rate limit per recruiter
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await context.supabase.from("application_messages").select("id", { count: "exact", head: true }).eq("sent_by", context.userId).gte("created_at", since);
    if ((count ?? 0) + data.applicationIds.length > RATE_LIMIT) {
      throw new Error(`Hourly notify limit reached (${RATE_LIMIT}). Try again later.`);
    }

    // load template if given
    let subject = data.subject ?? "";
    let bodyMd = data.bodyMd ?? "";
    if (data.templateId) {
      const { data: t } = await context.supabase.from("message_templates").select("subject, body_md, owner_id").eq("id", data.templateId).maybeSingle();
      if (!t || t.owner_id !== context.userId) throw new Error("Template not found");
      subject = data.subject ?? t.subject;
      bodyMd = data.bodyMd ?? t.body_md;
    }
    if (!subject || !bodyMd) throw new Error("Subject and body are required");

    // fetch applications + recruiter ownership check
    const { data: apps } = await context.supabase
      .from("applications")
      .select("id, applicant_id, jobs!inner ( title, companies!inner ( name, owner_id ) ), profiles!applications_applicant_id_fkey ( full_name )")
      .in("id", data.applicationIds);

    if (!apps || apps.length === 0) throw new Error("No applications matched");

    // recruiter name
    const { data: meProfile } = await context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const recruiterName = meProfile?.full_name || "The hiring team";

    let sentCount = 0;
    let errCount = 0;
    const lovableKey = process.env.LOVABLE_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const wantEmail = (data.channel === "email" || data.channel === "both") && lovableKey && resendKey;

    for (const row of apps) {
      const job = row.jobs as unknown as { title: string; companies: { name: string; owner_id: string } };
      if (job.companies.owner_id !== context.userId) continue; // skip not-owned
      const candidateName = (row.profiles as unknown as { full_name: string | null } | null)?.full_name || "there";
      const vars = {
        candidate_name: candidateName,
        job_title: job.title,
        company_name: job.companies.name,
        recruiter_name: recruiterName,
      };
      const renderedSubject = renderTemplate(subject, vars);
      const renderedBody = renderTemplate(bodyMd, vars);
      const html = emailShell(renderedSubject, mdToHtml(renderedBody));

      // in-app notification
      if (data.channel === "inapp" || data.channel === "both") {
        try {
          await context.supabase.from("notifications").insert({
            user_id: row.applicant_id,
            kind: "recruiter_message",
            title: renderedSubject,
            body: renderedBody.slice(0, 300),
            link: `/me/applications`,
          });
        } catch { /* swallow */ }
      }

      // email
      let emailStatus: "sent" | "error" | "skipped" = "skipped";
      let emailErr: string | null = null;
      if (wantEmail) {
        try {
          // get email via RPC (recruiter-owned join check)
          const { data: email } = await context.supabase.rpc("get_applicant_email", { _application_id: row.id });
          if (email) {
            const res = await fetch(`${RESEND_GATEWAY}/emails`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${lovableKey}`,
                "X-Connection-Api-Key": resendKey!,
              },
              body: JSON.stringify({
                from: "Lumen <onboarding@resend.dev>",
                to: [email],
                subject: renderedSubject,
                html,
              }),
            });
            if (res.ok) { emailStatus = "sent"; sentCount++; }
            else { emailStatus = "error"; emailErr = `${res.status}`; errCount++; }
          }
        } catch (e) {
          emailStatus = "error"; emailErr = e instanceof Error ? e.message : "unknown"; errCount++;
        }
      }

      await context.supabase.from("application_messages").insert({
        application_id: row.id,
        sent_by: context.userId,
        template_id: data.templateId ?? null,
        subject: renderedSubject,
        body: renderedBody,
        channel: data.channel,
        status: data.channel === "inapp" ? "sent" : emailStatus,
        error: emailErr,
      });
    }
    return { ok: true, total: apps.length, sent: sentCount, errors: errCount };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.all) {
      const { error } = await context.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", context.userId).is("read_at", null);
      if (error) throw error;
      return { ok: true };
    }
    if (!data.id) throw new Error("Need id or all");
    const { error } = await context.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
