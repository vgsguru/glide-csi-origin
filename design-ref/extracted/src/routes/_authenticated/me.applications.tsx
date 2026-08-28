import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav } from "@/components/site-nav";
import { ArrowRight, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me/applications")({
  component: MyApplications,
});

function MyApplications() {
  const { user } = useAuth();
  const { data: apps } = useQuery({
    queryKey: ["my-apps", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("applications")
        .select("id, status, score, created_at, retake_allowed, retake_count, jobs ( id, title, companies ( name ) ), interviews ( id )")
        .eq("applicant_id", user!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as Array<{
        id: string; status: string; score: number | null; created_at: string;
        retake_allowed: boolean; retake_count: number;
        jobs: { id: string; title: string; companies: { name: string } | null } | null;
        interviews: { id: string }[] | null;
      }>;
    },
  });

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">My applications</h1>
        <p className="mt-2 text-sm text-muted-foreground">Track every role you've applied to.</p>

        <div className="mt-6 space-y-3">
          {(!apps || apps.length === 0) ? (
            <div className="glass rounded-3xl p-10 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">No applications yet.</p>
              <Link to="/" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">Browse jobs</Link>
            </div>
          ) : apps.map((a) => {
            const scored = a.status === "scored" || a.status === "interview_complete";
            const continueHref = a.status === "submitted" || a.status === "video_uploaded" || a.status === "interview_pending"
              ? `/apply/${a.jobs?.id}` : a.interviews?.[0]?.id ? `/interview/${a.interviews[0].id}` : null;
            const retakeReady = a.retake_allowed && (a.retake_count ?? 0) < 1;
            return (
              <div key={a.id} className="glass flex items-center justify-between rounded-3xl px-6 py-5">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{a.jobs?.companies?.name}</p>
                  <p className="mt-0.5 font-display text-lg font-semibold">{a.jobs?.title}</p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">{a.status.replace(/_/g, " ")}{retakeReady ? " · retake available" : ""}</p>
                </div>
                <div className="flex items-center gap-4">
                  {a.score != null && <div className="text-right"><div className="font-display text-2xl font-bold">{a.score.toFixed(0)}</div><p className="text-xs text-muted-foreground">/100</p></div>}
                  {scored || retakeReady ? (
                    <Link to="/me/applications/$applicationId" params={{ applicationId: a.id }} className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">View <ArrowRight className="h-4 w-4" /></Link>
                  ) : continueHref ? (
                    <Link to={continueHref as "/"} className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Continue <ArrowRight className="h-4 w-4" /></Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

