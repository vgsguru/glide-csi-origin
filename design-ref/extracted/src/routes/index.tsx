import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Briefcase, Camera, Sparkles, BarChart3, MapPin, Wand2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — AI-powered hiring with live video interviews" },
      { name: "description", content: "Post jobs, run live AI video interviews, and rank applicants automatically. Built for fast, fair hiring." },
    ],
  }),
  component: Index,
});

type JobRow = {
  id: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  created_at: string;
  companies: { name: string; logo_url: string | null; verification_status: string | null } | null;
};

type MatchRow = { id: string; title: string; company_id: string; similarity: number; is_saved: boolean };

function Index() {
  const { user, isApplicant } = useAuth();
  const { data: jobs } = useQuery({
    queryKey: ["public-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, location, employment_type, created_at, companies ( name, logo_url, verification_status )")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as JobRow[];
    },
  });

  const { data: matches } = useQuery({
    queryKey: ["home-matches", user?.id],
    enabled: !!user && isApplicant,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("match_jobs_for_user", { _user: user!.id, _limit: 6 });
      if (error) return [] as MatchRow[];
      return (data ?? []) as MatchRow[];
    },
  });

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />

      {/* Hero */}
      <section className="px-4 pt-16 pb-24 sm:pt-24">
        <div className="mx-auto max-w-5xl text-center">
          <div className="glass mx-auto inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-foreground/70">
            <Sparkles className="h-3.5 w-3.5" /> Live AI video interviews · auto-ranked
          </div>
          <h1 className="mt-6 font-display text-5xl font-bold tracking-tight text-foreground sm:text-7xl">
            Hire with AI.
            <br />
            <span className="text-foreground/40">Decide with confidence.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Post a role, let candidates apply with a resume and a 60-second pitch, and watch our AI run a live video interview.
            Every applicant scored against your rubric — you only meet the top few.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth" className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90">
              Get started <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <a href="#jobs" className="glass inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-foreground transition hover:bg-secondary/60">
              Browse open jobs
            </a>
          </div>
        </div>

        {/* Hero glass preview card */}
        <div className="relative mx-auto mt-20 max-w-5xl">
          <div className="glass-strong rounded-3xl p-2">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { icon: Briefcase, title: "Post a job", body: "Add the role, ideal candidate, your interview questions, and a scoring rubric." },
                { icon: Camera, title: "Live AI interview", body: "Camera on, questions personalized from each resume. We transcribe and proctor." },
                { icon: BarChart3, title: "Ranked applicants", body: "Every candidate scored against your rubric with a clear breakdown." },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="glass rounded-2xl p-5">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* For you */}
      {user && isApplicant && matches && matches.length > 0 && (
        <section className="px-4 pb-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl flex items-center gap-2">
                  <Wand2 className="h-5 w-5" /> For you
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Matched to your resume with semantic search.</p>
              </div>
              <Link to="/me/saved" className="text-sm underline text-muted-foreground hover:text-foreground">See all</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {matches.slice(0, 6).map((m) => (
                <Link key={m.id} to="/jobs/$jobId" params={{ jobId: m.id }} className="glass-strong group flex items-center justify-between gap-3 rounded-2xl p-4 hover:translate-y-[-1px] hover:shadow-lg">
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{Math.round(m.similarity * 100)}% match{m.is_saved ? " · saved" : ""}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Jobs */}
      <section id="jobs" className="px-4 pb-32">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Open roles</h2>
              <p className="mt-2 text-sm text-muted-foreground">Apply with one click — your AI interview is ready when you are.</p>
            </div>
          </div>


          {(!jobs || jobs.length === 0) ? (
            <div className="glass rounded-3xl px-8 py-16 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-4 font-display text-lg font-semibold">No open roles yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Be the first recruiter to post a vacancy.</p>
              <Link to="/auth" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                Post a job
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  to="/jobs/$jobId"
                  params={{ jobId: job.id }}
                  className="glass group relative flex flex-col rounded-3xl p-6 transition hover:translate-y-[-2px] hover:shadow-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/5 text-foreground">
                      <Briefcase className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        {job.companies?.name ?? "Company"}
                        <VerifiedBadge status={job.companies?.verification_status} />
                      </p>
                    </div>

                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold leading-tight">{job.title}</h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {job.location && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
                        <MapPin className="h-3 w-3" /> {job.location}
                      </span>
                    )}
                    {job.employment_type && (
                      <span className="rounded-full bg-secondary px-2.5 py-1 capitalize">{job.employment_type.replace("_", " ")}</span>
                    )}
                  </div>
                  <div className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                    View role <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-border/60 px-4 py-8 text-center text-xs text-muted-foreground">
        Lumen · Built for hiring teams who care about every candidate.
      </footer>
    </div>
  );
}
