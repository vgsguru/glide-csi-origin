import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav } from "@/components/site-nav";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { embedMyProfile } from "@/lib/match.functions";
import { Bookmark, Sparkles, ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/me/saved")({
  component: SavedAndForYou,
});

type SavedRow = {
  id: string;
  created_at: string;
  jobs: {
    id: string; title: string; location: string | null; employment_type: string | null;
    companies: { name: string; logo_url: string | null; verification_status: string | null } | null;
  } | null;
};

type MatchRow = {
  id: string; title: string; company_id: string; similarity: number; is_saved: boolean;
  company?: { name: string; logo_url: string | null; verification_status: string | null } | null;
};

function SavedAndForYou() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const embedFn = useServerFn(embedMyProfile);

  const saved = useQuery({
    queryKey: ["saved-jobs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_jobs")
        .select("id, created_at, jobs ( id, title, location, employment_type, companies ( name, logo_url, verification_status ) )")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SavedRow[];
    },
  });

  const profile = useQuery({
    queryKey: ["profile-embed", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("embedding_updated_at").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const forYou = useQuery<MatchRow[]>({
    queryKey: ["match-jobs", user?.id, profile.data?.embedding_updated_at],
    enabled: !!user && !!profile.data?.embedding_updated_at,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("match_jobs_for_user", { _user: user!.id, _limit: 12 });
      if (error) throw error;
      const rows = (data ?? []) as MatchRow[];
      if (!rows.length) return rows;
      const ids = rows.map((r) => r.company_id);
      const { data: cos } = await supabase.from("companies").select("id, name, logo_url, verification_status").in("id", ids);
      const byId = new Map((cos ?? []).map((c) => [c.id, c]));
      return rows.map((r) => ({ ...r, company: byId.get(r.company_id) ?? null }));
    },
  });

  const unsave = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-jobs"] }),
  });

  const refreshProfile = useMutation({
    mutationFn: async () => embedFn({ data: {} }),
    onSuccess: (res) => {
      if ((res as { ok: boolean; reason?: string }).ok) {
        toast.success("Profile refreshed — pulling fresh recommendations");
        qc.invalidateQueries({ queryKey: ["profile-embed"] });
      } else {
        toast.message("Apply to a role with a resume first so we can learn your profile.");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to refresh"),
  });

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Saved &amp; recommended</h1>
            <p className="mt-1 text-sm text-muted-foreground">Bookmarked roles and AI-matched jobs based on your resume.</p>
          </div>
          <button
            onClick={() => refreshProfile.mutate()}
            disabled={refreshProfile.isPending}
            className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs hover:bg-secondary/60 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshProfile.isPending ? "animate-spin" : ""}`} /> Refresh matching
          </button>
        </div>

        {/* Saved */}
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Bookmark className="h-4 w-4" /> Saved</h2>
          {saved.isLoading ? (
            <div className="glass mt-3 h-24 animate-pulse rounded-2xl" />
          ) : !saved.data?.length ? (
            <div className="glass mt-3 rounded-2xl p-8 text-center text-sm text-muted-foreground">
              No saved jobs yet. Tap the bookmark icon on any role to save it here.
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {saved.data.map((s) => s.jobs && (
                <li key={s.id} className="glass-strong flex items-center justify-between gap-3 rounded-2xl p-4">
                  <Link to="/jobs/$jobId" params={{ jobId: s.jobs.id }} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{s.jobs.title}</p>
                      <VerifiedBadge status={s.jobs.companies?.verification_status} showLabel={false} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.jobs.companies?.name} {s.jobs.location ? `· ${s.jobs.location}` : ""}
                    </p>
                  </Link>
                  <button onClick={() => unsave.mutate(s.id)} className="text-xs text-muted-foreground hover:text-foreground">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* For you */}
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" /> For you</h2>
          {!profile.data?.embedding_updated_at ? (
            <div className="glass mt-3 rounded-2xl p-8 text-center text-sm text-muted-foreground">
              We'll match jobs to you after you apply once (we use your resume) or hit “Refresh matching”.
            </div>
          ) : forYou.isLoading ? (
            <div className="glass mt-3 h-24 animate-pulse rounded-2xl" />
          ) : !forYou.data?.length ? (
            <p className="mt-3 text-sm text-muted-foreground">No active matches right now — check back soon.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {forYou.data.map((m) => (
                <li key={m.id}>
                  <Link to="/jobs/$jobId" params={{ jobId: m.id }} className="glass-strong block rounded-2xl p-4 transition hover:bg-secondary/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{m.title}</p>
                          <VerifiedBadge status={m.company?.verification_status} showLabel={false} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{m.company?.name}</p>
                      </div>
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium">
                        {Math.round(Math.max(0, m.similarity) * 100)}% match
                      </span>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      View role <ArrowRight className="h-3 w-3" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
