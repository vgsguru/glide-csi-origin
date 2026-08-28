import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, MapPin, Briefcase, Building2, Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/jobs/$jobId")({
  head: ({ params }) => {
    const ogUrl = `/api/public/og/jobs/${params.jobId}.png`;
    return {
      meta: [
        { title: `Job · Lumen` },
        { name: "description", content: `Open role on Lumen.` },
        { property: "og:image", content: ogUrl },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: ogUrl },
      ],
    };
  },
  component: JobDetail,
});

type JobDetail = {
  id: string;
  title: string;
  description: string;
  ideal_profile: string | null;
  location: string | null;
  employment_type: string | null;
  salary_range: string | null;
  status: string;
  companies: { id: string; name: string; description: string | null; logo_url: string | null; website: string | null; verification_status: string | null } | null;
};

function JobDetail() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, description, ideal_profile, location, employment_type, salary_range, status, companies ( id, name, description, logo_url, website, verification_status )")
        .eq("id", jobId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as JobDetail | null;
    },
  });

  const { data: myApp } = useQuery({
    queryKey: ["my-app", jobId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("applications").select("id, status").eq("job_id", jobId).eq("applicant_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: saved } = useQuery({
    queryKey: ["saved", jobId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("saved_jobs").select("id").eq("job_id", jobId).eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const toggleSave = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to save");
      if (saved) {
        const { error } = await supabase.from("saved_jobs").delete().eq("id", saved.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("saved_jobs").insert({ user_id: user.id, job_id: jobId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved", jobId] });
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });
      toast.success(saved ? "Removed from saved" : "Saved to your list");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  function startApply() {
    if (!user) { navigate({ to: "/auth" }); return; }
    navigate({ to: "/apply/$jobId", params: { jobId } });
  }

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-12">
        {isLoading ? (
          <div className="glass h-72 animate-pulse rounded-3xl" />
        ) : !job ? (
          <div className="glass rounded-3xl p-10 text-center">
            <p className="font-display text-xl">This role isn't available.</p>
            <Link to="/" className="mt-4 inline-block text-sm underline">Back to jobs</Link>
          </div>
        ) : (
          <>
            <div className="glass-strong rounded-3xl p-8 sm:p-10">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" /> {job.companies?.name}
                <VerifiedBadge status={job.companies?.verification_status} />
              </div>
              <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">{job.title}</h1>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {job.location && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5"><MapPin className="h-3 w-3" />{job.location}</span>}
                {job.employment_type && <span className="rounded-full bg-secondary px-3 py-1.5 capitalize">{job.employment_type.replace("_", " ")}</span>}
                {job.salary_range && <span className="rounded-full bg-secondary px-3 py-1.5">{job.salary_range}</span>}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {myApp ? (
                  <Link to="/me/applications" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                    You've applied — view status <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button onClick={startApply} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                    Apply now <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {user && (
                  <button
                    onClick={() => toggleSave.mutate()}
                    disabled={toggleSave.isPending}
                    aria-pressed={!!saved}
                    aria-label={saved ? "Remove from saved" : "Save job"}
                    className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium hover:bg-secondary/60 disabled:opacity-60"
                  >
                    {saved ? <><BookmarkCheck className="h-4 w-4" /> Saved</> : <><Bookmark className="h-4 w-4" /> Save</>}
                  </button>
                )}
              </div>
            </div>

            <div className="glass mt-6 rounded-3xl p-8">
              <h2 className="font-display text-xl font-semibold">About the role</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{job.description}</p>
            </div>

            {job.ideal_profile && (
              <div className="glass mt-4 rounded-3xl p-8">
                <h2 className="font-display text-xl font-semibold">Who we're looking for</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{job.ideal_profile}</p>
              </div>
            )}

            {job.companies?.description && (
              <div className="glass mt-4 rounded-3xl p-8">
                <h2 className="font-display text-xl font-semibold">About {job.companies.name}</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{job.companies.description}</p>
              </div>
            )}

            <div className="glass mt-4 rounded-3xl p-6 text-xs text-muted-foreground">
              <Briefcase className="mr-1.5 inline h-3.5 w-3.5" />
              After applying you'll upload a resume, record a 60-second pitch, and take a live AI video interview.
            </div>
          </>
        )}
      </main>
    </div>
  );
}
