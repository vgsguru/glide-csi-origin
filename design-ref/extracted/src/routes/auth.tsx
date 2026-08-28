import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Sparkles, Briefcase, User, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { assignRecruiterRoleOnSignup } from "@/lib/ai.functions";
import { seedDemoAccounts } from "@/lib/seed.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · Lumen" }, { name: "description", content: "Sign in or create an account for Lumen." }] }),
  component: AuthPage,
});

type Mode = "signin" | "signup";
type Role = "recruiter" | "applicant";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [role, setRole] = useState<Role>("applicant");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const seed = useServerFn(seedDemoAccounts);

  async function loadDemo(which: "recruiter" | "applicant") {
    setBusy(true);
    try {
      const res = await seed();
      const acct = res.accounts.find((a) => a.role === which)!;
      setMode("signin");
      setEmail(acct.email);
      setPassword(acct.password);
      const { error } = await supabase.auth.signInWithPassword({ email: acct.email, password: acct.password });
      if (error) throw error;
      toast.success(`Signed in as demo ${which}`);
      navigate({ to: which === "recruiter" ? "/recruiter" : "/" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Demo seed failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function ensureRole(userId: string, r: Role) {
    // Applicants can self-assign via RLS; recruiters require a privileged server fn.
    if (r === "recruiter") {
      await assignRecruiterRoleOnSignup();
      return;
    }
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: r });
    // Ignore unique-violation / policy errors when the user already has a role.
    if (error && !/duplicate|already|row-level/i.test(error.message)) throw error;
  }


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.user) {
          await ensureRole(data.user.id, role);
        }
        toast.success("Account created. Welcome to Lumen.");
        navigate({ to: role === "recruiter" ? "/recruiter" : "/" });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Ensure role exists if user picked one
        if (data.user) {
          const { data: existing } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
          if (!existing || existing.length === 0) await ensureRole(data.user.id, role);
        }
        toast.success("Welcome back.");
        navigate({ to: "/" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function signInGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) { toast.error(String(result.error)); setBusy(false); return; }
      if (result.redirected) return;
      // session set; ensure role and go
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: existing } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
        if (!existing || existing.length === 0) await ensureRole(data.user.id, role);
      }
      navigate({ to: "/" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="bg-ambient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-display text-xl font-semibold">Lumen</span>
        </Link>

        <div className="glass-strong rounded-3xl p-7">
          <div className="mb-5 flex rounded-full bg-secondary p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition ${mode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {mode === "signup" && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">I am a…</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "applicant" as const, label: "Applicant", icon: User },
                  { value: "recruiter" as const, label: "Recruiter", icon: Briefcase },
                ]).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRole(value)}
                    className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition ${role === value ? "bg-primary text-primary-foreground shadow-sm" : "glass text-foreground hover:bg-secondary/60"}`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                required
                className="w-full rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-foreground/30"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
              className="w-full rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-foreground/30"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className="w-full rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-foreground/30"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={signInGoogle}
            disabled={busy}
            className="glass flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-foreground transition hover:bg-secondary/60 disabled:opacity-60"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
            Continue with Google
          </button>

          <div className="mt-5 rounded-2xl border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Demo accounts</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => loadDemo("recruiter")}
                disabled={busy}
                className="glass flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-medium transition hover:bg-secondary/60 disabled:opacity-60"
              >
                <Wand2 className="h-3.5 w-3.5" /> Demo recruiter
              </button>
              <button
                type="button"
                onClick={() => loadDemo("applicant")}
                disabled={busy}
                className="glass flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-medium transition hover:bg-secondary/60 disabled:opacity-60"
              >
                <Wand2 className="h-3.5 w-3.5" /> Demo applicant
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">One click seeds & signs you in. Password: <code>DemoPass!234</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}
