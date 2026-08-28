import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav } from "@/components/site-nav";
import { ArrowRight, Building2, Briefcase, Users, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/recruiter")({
  component: RecruiterDashboard,
});

function RecruiterDashboard() {
  const { user } = useAuth();
  const { data: company } = useQuery({
    queryKey: ["my-company", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("*").eq("owner_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: jobs } = useQuery({
    queryKey: ["my-jobs", company?.id],
    enabled: !!company,
    queryFn: async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, title, status, created_at, applications ( count )")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Recruiter</p>
            <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">{company?.name ?? "Welcome"}</h1>
          </div>
          {company && (
            <Link to="/recruiter/jobs/new" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> New job
            </Link>
          )}
        </div>

        {!company ? (
          <div className="glass-strong rounded-3xl p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-foreground" />
            <h2 className="mt-4 font-display text-2xl font-semibold">Set up your company</h2>
            <p className="mt-2 text-sm text-muted-foreground">You need a company before you can post jobs.</p>
            <Link to="/recruiter/company" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              Create company <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="glass rounded-2xl p-5">
                <Briefcase className="h-5 w-5 text-muted-foreground" />
                <p className="mt-3 font-display text-3xl font-semibold">{jobs?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Open positions</p>
              </div>
              <div className="glass rounded-2xl p-5">
                <Users className="h-5 w-5 text-muted-foreground" />
                <p className="mt-3 font-display text-3xl font-semibold">{jobs?.reduce((s, j) => s + ((j.applications as unknown as { count: number }[])?.[0]?.count ?? 0), 0) ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total applicants</p>
              </div>
              <Link to="/recruiter/company" className="glass rounded-2xl p-5 transition hover:bg-secondary/60">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <p className="mt-3 font-display text-lg font-semibold">Company settings</p>
                <p className="text-xs text-muted-foreground">Update name, logo, description</p>
              </Link>
            </div>







            <h2 className="mt-10 mb-4 font-display text-xl font-semibold">Your jobs</h2>
            {(!jobs || jobs.length === 0) ? (
              <div className="glass rounded-3xl p-10 text-center text-sm text-muted-foreground">
                No jobs yet. <Link to="/recruiter/jobs/new" className="font-medium text-foreground underline">Post your first role</Link>.
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((j) => (
                  <div key={j.id} className="glass group flex items-center justify-between rounded-2xl px-6 py-4">
                    <Link to="/recruiter/jobs/$jobId" params={{ jobId: j.id }} className="flex-1">
                      <p className="font-display text-lg font-semibold">{j.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{j.status} · {(j.applications as unknown as { count: number }[])?.[0]?.count ?? 0} applicants</p>
                    </Link>
                    <div className="flex items-center gap-2">
                      <Link to="/recruiter/jobs/$jobId/pipeline" params={{ jobId: j.id }} className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/70">Pipeline</Link>
                      <Link to="/recruiter/jobs/$jobId" params={{ jobId: j.id }} className="rounded-full p-2 hover:bg-secondary"><ArrowRight className="h-4 w-4" /></Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
