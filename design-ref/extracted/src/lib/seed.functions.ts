import { createServerFn } from "@tanstack/react-start";

export const DEMO_ACCOUNTS = {
  recruiter: { email: "recruiter@demo.lumen", password: "DemoPass!234", full_name: "Demo Recruiter" },
  applicant: { email: "applicant@demo.lumen", password: "DemoPass!234", full_name: "Demo Applicant" },
} as const;

export const seedDemoAccounts = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const results: Record<string, { created: boolean; email: string; user_id: string }> = {};

  for (const [role, info] of Object.entries(DEMO_ACCOUNTS) as Array<
    ["recruiter" | "applicant", (typeof DEMO_ACCOUNTS)[keyof typeof DEMO_ACCOUNTS]]
  >) {
    // Find existing user by email (paginate first page; small demo scale)
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw new Error(listErr.message);
    let user = list.users.find((u) => u.email?.toLowerCase() === info.email.toLowerCase());
    let created = false;

    if (!user) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: info.email,
        password: info.password,
        email_confirm: true,
        user_metadata: { full_name: info.full_name },
      });
      if (error) throw new Error(error.message);
      user = data.user!;
      created = true;
    } else {
      // Reset password so it always matches what we hand back.
      await supabaseAdmin.auth.admin.updateUserById(user.id, { password: info.password, email_confirm: true });
    }

    // Ensure role assignment (idempotent).
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", role);
    if (!existing || existing.length === 0) {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: user.id, role });
      if (roleErr && !/duplicate|already/i.test(roleErr.message)) throw new Error(roleErr.message);
    }

    results[role] = { created, email: info.email, user_id: user.id };
  }

  return {
    ok: true,
    accounts: [
      { role: "recruiter", email: DEMO_ACCOUNTS.recruiter.email, password: DEMO_ACCOUNTS.recruiter.password },
      { role: "applicant", email: DEMO_ACCOUNTS.applicant.email, password: DEMO_ACCOUNTS.applicant.password },
    ],
    results,
  };
});
