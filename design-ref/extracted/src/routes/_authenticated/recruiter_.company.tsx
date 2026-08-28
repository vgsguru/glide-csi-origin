import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav } from "@/components/site-nav";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { requestCompanyVerification } from "@/lib/match.functions";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/recruiter_/company")({
  component: CompanySettings,
});

function CompanySettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: company } = useQuery({
    queryKey: ["my-company-edit", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("*").eq("owner_id", user!.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (company) {
      setName(company.name ?? "");
      setDescription(company.description ?? "");
      setWebsite(company.website ?? "");
      setLogoUrl(company.logo_url ?? "");
    }
  }, [company]);

  async function ensureRecruiterRole() {
    await supabase.from("user_roles").upsert({ user_id: user!.id, role: "recruiter" }, { onConflict: "user_id,role" });
  }

  async function uploadLogo(file: File) {
    const path = `${user!.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await ensureRecruiterRole();
      if (company) {
        const { error } = await supabase.from("companies").update({ name, description, website, logo_url: logoUrl }).eq("id", company.id);
        if (error) throw error;
        toast.success("Company updated");
      } else {
        const { error } = await supabase.from("companies").insert({ owner_id: user!.id, name, description, website, logo_url: logoUrl });
        if (error) throw error;
        toast.success("Company created");
      }
      navigate({ to: "/recruiter" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">{company ? "Edit company" : "Create your company"}</h1>
        <form onSubmit={save} className="glass-strong mt-6 space-y-4 rounded-3xl p-7">
          <Field label="Company name">
            <input required value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </Field>
          <Field label="About">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="input resize-none" />
          </Field>
          <Field label="Website">
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className="input" />
          </Field>
          <Field label="Logo">
            <div className="flex items-center gap-4">
              {logoUrl && <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />}
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} className="text-sm" />
            </div>
          </Field>
          <button disabled={busy} className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {busy ? "Saving…" : company ? "Save changes" : "Create company"}
          </button>
        </form>

        {company && <VerificationCard company={company} />}

        <style>{`.input { width:100%; border-radius: 1rem; border: 1px solid var(--color-border); background: oklch(1 0 0 / 0.6); padding: 0.7rem 1rem; font-size: 0.875rem; outline: none; transition: border-color 0.15s; } .input:focus { border-color: oklch(0.12 0 0 / 0.3); }`}</style>
      </main>
    </div>
  );
}

type CompanyRow = { id: string; name: string; website: string | null; verification_status: string | null };

function VerificationCard({ company }: { company: CompanyRow }) {
  const qc = useQueryClient();
  const requestFn = useServerFn(requestCompanyVerification);
  const [domain, setDomain] = useState(() => {
    try { return company.website ? new URL(company.website).host.replace(/^www\./, "") : ""; } catch { return ""; }
  });
  const [evidence, setEvidence] = useState("");
  const [notes, setNotes] = useState("");

  const submit = useMutation({
    mutationFn: () => requestFn({ data: { companyId: company.id, domain: domain || undefined, evidenceUrl: evidence || undefined, notes: notes || undefined } }),
    onSuccess: () => {
      toast.success("Verification requested — admins will review shortly");
      qc.invalidateQueries({ queryKey: ["my-company-edit"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const status = company.verification_status ?? "unverified";

  return (
    <div className="glass-strong mt-4 rounded-3xl p-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Verification</h2>
        {status === "verified" ? <VerifiedBadge status="verified" /> :
          <span className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${status === "pending" ? "bg-amber-500/10 text-amber-700" : status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{status}</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Verified companies get a badge on every job post and rank slightly higher in candidate feeds.
      </p>

      {status === "verified" && <p className="mt-4 text-sm text-foreground/70">You're verified — nothing to do here.</p>}
      {status === "pending" && <p className="mt-4 text-sm text-foreground/70">Pending admin review.</p>}
      {(status === "unverified" || status === "rejected") && (
        <form
          onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}
          className="mt-4 space-y-3"
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Company domain</span>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Evidence URL (LinkedIn page, registry, press)</span>
            <input type="url" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://" className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input resize-none" placeholder="Anything that helps us verify your company." />
          </label>
          <button disabled={submit.isPending} className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60">
            {submit.isPending ? "Submitting…" : "Request verification"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
