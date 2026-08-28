import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { decideCompanyVerification } from "@/lib/match.functions";
import { toast } from "sonner";
import { Check, X, ExternalLink, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/verifications")({
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!data) throw redirect({ to: "/" });
  },
  component: AdminVerifications,
});

type Row = {
  id: string;
  company_id: string;
  requested_by: string;
  domain: string | null;
  evidence_url: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  companies: { name: string; website: string | null; logo_url: string | null } | null;
};

function AdminVerifications() {
  const qc = useQueryClient();
  const decide = useServerFn(decideCompanyVerification);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-verifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_verifications")
        .select("id, company_id, requested_by, domain, evidence_url, notes, status, created_at, companies ( name, website, logo_url )")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const act = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      decide({ data: { verificationId: id, approve } }),
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Verified" : "Rejected");
      qc.invalidateQueries({ queryKey: ["admin-verifications"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Company verifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Approve or reject company verification requests.</p>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            <div className="glass h-32 animate-pulse rounded-2xl" />
          ) : !rows?.length ? (
            <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">No requests yet.</div>
          ) : rows.map((r) => (
            <div key={r.id} className="glass-strong rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {r.companies?.logo_url && <img src={r.companies.logo_url} className="h-8 w-8 rounded-lg object-cover" alt="" />}
                    <p className="font-medium truncate">{r.companies?.name ?? "—"}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${r.status === "pending" ? "bg-amber-500/10 text-amber-700" : r.status === "verified" ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>{r.status}</span>
                  </div>
                  <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
                    {r.domain && <div><span className="font-medium text-foreground/80">Domain:</span> {r.domain}</div>}
                    {r.companies?.website && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-foreground/80">Website:</span>
                        <a href={r.companies.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                          {r.companies.website} <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {r.evidence_url && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-foreground/80">Evidence:</span>
                        <a href={r.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                          link <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {r.notes && <div className="mt-1 whitespace-pre-wrap text-foreground/70">“{r.notes}”</div>}
                  </dl>
                </div>
                {r.status === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => act.mutate({ id: r.id, approve: true })} disabled={act.isPending}
                      className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button onClick={() => act.mutate({ id: r.id, approve: false })} disabled={act.isPending}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50">
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
