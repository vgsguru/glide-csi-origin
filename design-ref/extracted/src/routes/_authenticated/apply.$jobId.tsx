import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav } from "@/components/site-nav";
import { parseResume, transcribeIntro, startInterview } from "@/lib/ai.functions";
import { embedMyProfile } from "@/lib/match.functions";
import { toast } from "sonner";
import { Upload, Video, Camera, CheckCircle2, ArrowRight, Square, Circle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/apply/$jobId")({
  component: ApplyWizard,
});

type Step = "resume" | "video" | "device" | "ready";

async function fileToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function ApplyWizard() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const parseFn = useServerFn(parseResume);
  const transcribeFn = useServerFn(transcribeIntro);
  const startFn = useServerFn(startInterview);
  const embedFn = useServerFn(embedMyProfile);

  const [step, setStep] = useState<Step>("resume");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ensure applicant role + application row exists
  useEffect(() => {
    if (!user) return;
    (async () => {
      await supabase.from("user_roles").upsert({ user_id: user.id, role: "applicant" }, { onConflict: "user_id,role" });
      const { data: existing } = await supabase.from("applications").select("id, status, resume_url, intro_video_url").eq("job_id", jobId).eq("applicant_id", user.id).maybeSingle();
      if (existing) {
        setApplicationId(existing.id);
        if (existing.status === "interview_pending" || existing.status === "interview_in_progress") setStep("device");
        else if (existing.intro_video_url) setStep("device");
        else if (existing.resume_url) setStep("video");
      } else {
        const { data, error } = await supabase.from("applications").insert({ job_id: jobId, applicant_id: user.id }).select("id").single();
        if (!error && data) setApplicationId(data.id);
      }
    })();
  }, [user, jobId]);

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">Apply</h1>
        <p className="mt-2 text-sm text-muted-foreground">Four quick steps. You can pause and return anytime.</p>

        <div className="my-6 flex gap-2">
          {(["resume", "video", "device", "ready"] as Step[]).map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${["resume","video","device","ready"].indexOf(step) >= i ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>

        {step === "resume" && applicationId && (
          <ResumeStep applicationId={applicationId} parseFn={parseFn} embedFn={embedFn} onDone={() => setStep("video")} busy={busy} setBusy={setBusy} userId={user!.id} />
        )}
        {step === "video" && applicationId && (
          <VideoStep applicationId={applicationId} transcribeFn={transcribeFn} onDone={() => setStep("device")} userId={user!.id} />
        )}
        {step === "device" && applicationId && (
          <DeviceStep onReady={() => setStep("ready")} />
        )}
        {step === "ready" && applicationId && (
          <ReadyStep applicationId={applicationId} startFn={startFn} onStart={(interviewId) => navigate({ to: "/interview/$interviewId", params: { interviewId } })} />
        )}
      </main>
    </div>
  );
}

function ResumeStep({ applicationId, parseFn, embedFn, onDone, userId, busy, setBusy }: { applicationId: string; parseFn: ReturnType<typeof useServerFn<typeof parseResume>>; embedFn: ReturnType<typeof useServerFn<typeof embedMyProfile>>; onDone: () => void; userId: string; busy: boolean; setBusy: (b: boolean) => void }) {
  async function handle(file: File) {
    setBusy(true);
    try {
      const path = `${userId}/${applicationId}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("resumes").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("resumes").createSignedUrl(path, 60 * 60 * 24 * 30);
      await supabase.from("applications").update({ resume_url: signed?.signedUrl ?? path }).eq("id", applicationId);
      toast("Parsing resume…");
      const b64 = await fileToBase64(file);
      const res = await parseFn({ data: { applicationId, pdfBase64: b64, mime: file.type || "application/pdf" } });
      const resumeText = (res as { resumeText?: string } | undefined)?.resumeText;
      if (resumeText && embedFn) embedFn({ data: { resumeText } }).catch(() => {});
      toast.success("Resume saved");
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally { setBusy(false); }
  }
  return (
    <div className="glass-strong rounded-3xl p-8 text-center">
      <Upload className="mx-auto h-8 w-8" />
      <h2 className="mt-3 font-display text-xl font-semibold">Upload your resume</h2>
      <p className="mt-1 text-sm text-muted-foreground">PDF · up to 10 MB. We'll extract the key info.</p>
      <label className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
        {busy ? "Working…" : "Choose PDF"}
        <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} disabled={busy} />
      </label>
    </div>
  );
}

function VideoStep({ applicationId, transcribeFn, onDone, userId }: { applicationId: string; transcribeFn: ReturnType<typeof useServerFn<typeof transcribeIntro>>; onDone: () => void; userId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((s) => {
      streamRef.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
    }).catch(() => toast.error("Camera/mic permission needed"));
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((e) => {
      if (e >= 60) { stop(); return 60; }
      return e + 1;
    }), 1000);
    return () => clearInterval(id);
  }, [recording]);

  function start() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const r = new MediaRecorder(streamRef.current, { mimeType: mime });
    r.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    r.onstop = () => { setRecorded(new Blob(chunksRef.current, { type: mime })); setRecording(false); };
    r.start();
    recRef.current = r;
    setElapsed(0);
    setRecording(true);
  }
  function stop() { recRef.current?.state === "recording" && recRef.current.stop(); }

  async function submit() {
    if (!recorded) return;
    setBusy(true);
    try {
      const path = `${userId}/${applicationId}-${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage.from("intro-videos").upload(path, recorded, { upsert: true, contentType: recorded.type });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("intro-videos").createSignedUrl(path, 60 * 60 * 24 * 30);
      await supabase.from("applications").update({ intro_video_url: signed?.signedUrl ?? path }).eq("id", applicationId);
      toast("Transcribing your pitch…");
      const b64 = await fileToBase64(recorded);
      await transcribeFn({ data: { applicationId, audioBase64: b64, mime: recorded.type } });
      toast.success("Pitch saved");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="glass-strong rounded-3xl p-7">
      <h2 className="font-display text-xl font-semibold">Record a 60-second pitch</h2>
      <p className="mt-1 text-sm text-muted-foreground">Why are you a fit for this role?</p>
      <div className="relative mt-5 overflow-hidden rounded-2xl bg-black aspect-video">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {recording && <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-destructive/90 px-3 py-1 text-xs font-semibold text-destructive-foreground"><Circle className="h-2 w-2 fill-current" /> REC {elapsed}s / 60</div>}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {!recorded && !recording && <button onClick={start} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"><Circle className="h-4 w-4" /> Start recording</button>}
        {recording && <button onClick={stop} className="inline-flex items-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-sm font-medium text-destructive-foreground"><Square className="h-4 w-4" /> Stop</button>}
        {recorded && !recording && <>
          <button onClick={() => { setRecorded(null); setElapsed(0); }} className="glass rounded-full px-5 py-2.5 text-sm">Re-record</button>
          <button disabled={busy} onClick={submit} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">{busy ? "Uploading…" : "Use this clip"} <ArrowRight className="h-4 w-4" /></button>
        </>}
      </div>
    </div>
  );
}

function DeviceStep({ onReady }: { onReady: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((s) => {
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      setOk(true);
      // we keep stream for next step; user will move on
      return () => s.getTracks().forEach((t) => t.stop());
    }).catch(() => toast.error("Camera/mic permission needed"));
  }, []);
  return (
    <div className="glass-strong rounded-3xl p-7">
      <h2 className="font-display text-xl font-semibold">Device check</h2>
      <p className="mt-1 text-sm text-muted-foreground">We need camera + mic on for the interview. Snapshots are taken periodically for integrity.</p>
      <div className="mt-5 overflow-hidden rounded-2xl bg-black aspect-video">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${ok ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}><CheckCircle2 className="h-3.5 w-3.5" /> {ok ? "Camera & mic ready" : "Waiting for permission"}</div>
      </div>
      <button disabled={!ok} onClick={onReady} className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60">Continue</button>
    </div>
  );
}

function ReadyStep({ applicationId, startFn, onStart }: { applicationId: string; startFn: ReturnType<typeof useServerFn<typeof startInterview>>; onStart: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const res = await startFn({ data: { applicationId } });
      sessionStorage.setItem(`interview-${res.interviewId}-questions`, JSON.stringify(res.questions));
      onStart(res.interviewId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start");
    } finally { setBusy(false); }
  }
  return (
    <div className="glass-strong rounded-3xl p-8 text-center">
      <Video className="mx-auto h-8 w-8" />
      <h2 className="mt-3 font-display text-2xl font-semibold">You're ready</h2>
      <p className="mt-2 text-sm text-muted-foreground">A series of personalized questions. Take your time — we score answers, not speed.</p>
      <button disabled={busy} onClick={go} className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {busy ? "Preparing…" : "Start AI interview"} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
