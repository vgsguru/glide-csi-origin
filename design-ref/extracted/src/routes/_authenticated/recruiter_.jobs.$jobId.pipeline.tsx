import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { setPipelineStage } from "@/lib/ai.functions";
import { bulkUpdateApplicationStage } from "@/lib/match.functions";
import { bulkNotify } from "@/lib/messaging.functions";
import { ArrowLeft, ChevronRight, ChevronLeft, CheckSquare, Square as SquareIcon, X, Mail, Columns } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recruiter_/jobs/$jobId/pipeline")({
  component: Pipeline,
});

type Stage = "applied" | "interviewed" | "shortlisted" | "offer" | "rejected";
const STAGES: { id: Stage; label: string }[] = [
  { id: "applied", label: "Applied" },
  { id: "interviewed", label: "Interviewed" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" },
];

type AppRow = {
  id: string;
  score: number | null;
  ai_summary: string | null;
  pipeline_status: Stage;
  profiles: { full_name: string | null } | null;
};

function Pipeline() {
  const { jobId } = Route.useParams();
  const qc = useQueryClient();
  const setStageFn = useServerFn(setPipelineStage);

  const { data: job } = useQuery({
    queryKey: ["job-pipeline-meta", jobId],
    queryFn: async () => (await supabase.from("jobs").select("title").eq("id", jobId).maybeSingle()).data,
  });

  const { data: apps } = useQuery({
    queryKey: ["pipeline", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id, score, ai_summary, pipeline_status, profiles!applications_applicant_id_fkey ( full_name )")
        .eq("job_id", jobId)
        .order("score", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as AppRow[];
    },
  });

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => setStageFn({ data: { applicationId: id, stage } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipeline", jobId] }); toast.success("Stage updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const bulkFn = useServerFn(bulkUpdateApplicationStage);
  const notifyFn = useServerFn(bulkNotify);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allIds = useMemo(() => new Set((apps ?? []).map((a) => a.id)), [apps]);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const bulk = useMutation({
    mutationFn: async (stage: Stage) => bulkFn({ data: { applicationIds: Array.from(selected), stage } }),
    onSuccess: (_d, stage) => {
      toast.success(`Moved ${selected.size} to ${stage}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["pipeline", jobId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk update failed"),
  });

  type Tpl = { id: string; name: string; subject: string; body_md: string };
  const { data: msgTpls } = useQuery({
    queryKey: ["msg-tpls-pipeline"],
    queryFn: async () => (await supabase.from("message_templates").select("id, name, subject, body_md").order("created_at", { ascending: false })).data as Tpl[] | null,
  });
  const [chosenTplId, setChosenTplId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [channel, setChannel] = useState<"email" | "inapp" | "both">("both");

  function applyTpl(id: string) {
    setChosenTplId(id);
    const t = (msgTpls ?? []).find((x) => x.id === id);
    if (t) { setSubject(t.subject); setBodyMd(t.body_md); }
  }

  const notify = useMutation({
    mutationFn: async () => notifyFn({ data: {
      applicationIds: Array.from(selected),
      channel,
      templateId: chosenTplId || undefined,
      subject: subject || undefined,
      bodyMd: bodyMd || undefined,
    }}),
    onSuccess: (r) => {
      const res = r as { total: number; sent: number; errors: number };
      toast.success(`Notified ${res.total} candidates (${res.sent} emails sent, ${res.errors} errors)`);
      setNotifyOpen(false); setSelected(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Notify failed"),
  });

  function openCompare() {
    if (selected.size === 0) return;
    navigate({ to: "/recruiter/jobs/$jobId/compare", params: { jobId }, search: { ids: Array.from(selected).slice(0, 4).join(",") } });
  }


  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function adjacent(stage: Stage, dir: -1 | 1): Stage | null {
    const idx = STAGES.findIndex((s) => s.id === stage);
    const next = idx + dir;
    if (next < 0 || next >= STAGES.length) return null;
    return STAGES[next].id;
  }

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 py-8 pb-32">
        <Link to="/recruiter/jobs/$jobId" params={{ jobId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to applicants</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">{job?.title} — pipeline</h1>
            <p className="mt-1 text-sm text-muted-foreground">Move candidates with arrows, or select multiple for bulk actions.</p>
          </div>
          <button
            onClick={() => setSelected(selected.size === allIds.size ? new Set() : new Set(allIds))}
            className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs hover:bg-secondary/60"
          >
            {selected.size === allIds.size && allIds.size > 0 ? <CheckSquare className="h-3.5 w-3.5" /> : <SquareIcon className="h-3.5 w-3.5" />}
            {selected.size === allIds.size && allIds.size > 0 ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          {STAGES.map((stage) => {
            const list = (apps ?? []).filter((a) => a.pipeline_status === stage.id);
            return (
              <div key={stage.id} className="glass rounded-3xl p-3">
                <div className="flex items-center justify-between px-2 pb-3">
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wider">{stage.label}</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{list.length}</span>
                </div>
                <div className="space-y-2">
                  {list.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">—</p>
                  ) : list.map((a) => {
                    const isSel = selected.has(a.id);
                    return (
                      <div key={a.id} className={`glass-strong rounded-2xl p-3 transition ${isSel ? "ring-2 ring-foreground/40" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => toggle(a.id)}
                            aria-pressed={isSel}
                            aria-label={isSel ? "Deselect" : "Select"}
                            className="mt-0.5 text-muted-foreground hover:text-foreground"
                          >
                            {isSel ? <CheckSquare className="h-4 w-4" /> : <SquareIcon className="h-4 w-4" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <Link to="/recruiter/applications/$applicationId" params={{ applicationId: a.id }} className="block truncate text-sm font-medium hover:underline">
                              {a.profiles?.full_name || "Anonymous"}
                            </Link>
                            <p className="text-xs text-muted-foreground">Score {a.score?.toFixed(0) ?? "—"}/100</p>
                          </div>
                        </div>
                        {a.ai_summary && <p className="mt-2 line-clamp-3 text-xs text-foreground/70">{a.ai_summary}</p>}
                        <div className="mt-2 flex justify-between">
                          {adjacent(a.pipeline_status, -1) ? (
                            <button
                              disabled={move.isPending}
                              onClick={() => move.mutate({ id: a.id, stage: adjacent(a.pipeline_status, -1)! })}
                              className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
                            ><ChevronLeft className="h-4 w-4" /></button>
                          ) : <span />}
                          {adjacent(a.pipeline_status, 1) ? (
                            <button
                              disabled={move.isPending}
                              onClick={() => move.mutate({ id: a.id, stage: adjacent(a.pipeline_status, 1)! })}
                              className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
                            ><ChevronRight className="h-4 w-4" /></button>
                          ) : <span />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {selected.size > 0 && (
          <div
            role="region"
            aria-label="Bulk actions"
            className="fixed inset-x-0 bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <button onClick={() => setSelected(new Set())} className="rounded-full p-1 hover:bg-secondary" aria-label="Clear selection"><X className="h-4 w-4" /></button>
              <p className="text-sm font-medium">{selected.size} selected</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setNotifyOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"><Mail className="h-3 w-3" /> Notify</button>
              <button onClick={openCompare} disabled={selected.size < 2} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-foreground hover:text-background disabled:opacity-50"><Columns className="h-3 w-3" /> Compare</button>
              {STAGES.map((s) => (
                <button
                  key={s.id}
                  disabled={bulk.isPending}
                  onClick={() => bulk.mutate(s.id)}
                  className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-foreground hover:text-background disabled:opacity-60"
                >
                  Move to {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {notifyOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setNotifyOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} className="glass-strong w-full max-w-xl rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Notify {selected.size} candidates</h2>
                <button onClick={() => setNotifyOpen(false)} className="rounded-full p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select value={chosenTplId} onChange={(e) => applyTpl(e.target.value)} className="rounded-full border border-border bg-background/40 px-3 py-2 text-sm">
                    <option value="">Choose template (optional)</option>
                    {msgTpls?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={channel} onChange={(e) => setChannel(e.target.value as "email" | "inapp" | "both")} className="rounded-full border border-border bg-background/40 px-3 py-2 text-sm">
                    <option value="both">Email + in-app</option>
                    <option value="email">Email only</option>
                    <option value="inapp">In-app only</option>
                  </select>
                </div>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-full border border-border bg-background/40 px-4 py-2 text-sm" />
                <textarea rows={8} value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} placeholder="Message body (markdown). Use {{candidate_name}}, {{job_title}}, {{company_name}}, {{recruiter_name}}." className="w-full rounded-2xl border border-border bg-background/40 p-3 text-sm" />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setNotifyOpen(false)} className="rounded-full bg-secondary px-4 py-2 text-sm">Cancel</button>
                <button disabled={notify.isPending || !subject.trim() || !bodyMd.trim()} onClick={() => notify.mutate()} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Mail className="h-4 w-4" /> {notify.isPending ? "Sending…" : `Send to ${selected.size}`}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
