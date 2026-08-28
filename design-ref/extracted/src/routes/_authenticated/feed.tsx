import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav } from "@/components/site-nav";
import { PostCard, PostCardSkeleton, type FeedPost } from "@/components/feed/PostCard";
import { Briefcase, Sparkles, ImagePlus, X, Loader2, Inbox, AlertTriangle, RotateCw } from "lucide-react";
import { toast } from "sonner";

const feedSearch = z.object({
  tab: fallback(z.enum(["jobs", "applicants"]), "jobs").default("jobs"),
});

export const Route = createFileRoute("/_authenticated/feed")({
  validateSearch: zodValidator(feedSearch),
  component: FeedPage,
});

const PAGE_SIZE = 10;

type Cursor = { score: number; created_at: string; id: string } | null;

async function loadFeedPage(viewerId: string, kind: "job" | "showcase", cursor: Cursor): Promise<{ posts: FeedPost[]; nextCursor: Cursor }> {
  const { data, error } = await supabase.rpc("rank_feed", {
    _viewer: viewerId,
    _kind: kind,
    _limit: PAGE_SIZE,
    _cursor_score: cursor?.score ?? null,
    _cursor_created_at: cursor?.created_at ?? null,
    _cursor_id: cursor?.id ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<Omit<FeedPost, "author" | "company"> & { score: number }>;
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean) as string[])];
  const [profiles, companies] = await Promise.all([
    authorIds.length ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", authorIds) : Promise.resolve({ data: [] as any[] }),
    companyIds.length ? supabase.from("companies").select("id, name, logo_url").in("id", companyIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const pmap = new Map((profiles.data ?? []).map((p: any) => [p.id, p]));
  const cmap = new Map((companies.data ?? []).map((c: any) => [c.id, c]));
  const posts: FeedPost[] = rows.map((r) => ({
    ...r,
    media_urls: Array.isArray(r.media_urls) ? r.media_urls : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    author: pmap.get(r.author_id) ?? null,
    company: r.company_id ? cmap.get(r.company_id) ?? null : null,
  }));
  const last = rows[rows.length - 1];
  const nextCursor: Cursor = rows.length < PAGE_SIZE || !last
    ? null
    : { score: Number(last.score), created_at: last.created_at, id: last.id };
  return { posts, nextCursor };
}

function FeedPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { user, isApplicant, isRecruiter } = useAuth();
  const kind = tab === "jobs" ? "job" : "showcase";

  const query = useInfiniteQuery({
    queryKey: ["feed", kind, user?.id],
    enabled: !!user,
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) => loadFeedPage(user!.id, kind, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });

  const posts = useMemo(() => query.data?.pages.flatMap((p) => p.posts) ?? [], [query.data]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        query.fetchNextPage();
      }
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tight">Feed</h1>
          <div className="glass inline-flex rounded-full p-1 text-xs">
            <button
              onClick={() => navigate({ to: "/feed", search: { tab: "jobs" } })}
              className={`rounded-full px-4 py-1.5 transition ${tab === "jobs" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Briefcase className="mr-1 inline h-3.5 w-3.5" /> Jobs
            </button>
            <button
              onClick={() => navigate({ to: "/feed", search: { tab: "applicants" } })}
              className={`rounded-full px-4 py-1.5 transition ${tab === "applicants" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Sparkles className="mr-1 inline h-3.5 w-3.5" /> Applicants
            </button>
          </div>
        </div>

        {tab === "jobs" && isRecruiter && (
          <div className="mb-4 glass-strong rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Posting a job automatically shares it to this feed.</p>
              <Link to="/recruiter/jobs/new" className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">Post a job</Link>
            </div>
          </div>
        )}

        {tab === "applicants" && isApplicant && (
          <ShowcaseComposer onPosted={() => query.refetch()} />
        )}

        {query.isLoading && (
          <div className="space-y-4">
            <PostCardSkeleton />
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        )}

        {query.isError && posts.length === 0 && (
          <ErrorRetry
            message={(query.error as Error)?.message ?? "Couldn't load the feed."}
            onRetry={() => query.refetch()}
            busy={query.isFetching}
          />
        )}

        <div className="space-y-4">
          {posts.map((p) => <PostCard key={p.id} post={p} onChange={() => query.refetch()} />)}
          {!query.isLoading && !query.isError && posts.length === 0 && (
            <div className="glass rounded-3xl p-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-secondary text-muted-foreground">
                <Inbox className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold">
                {tab === "jobs" ? "No jobs yet" : "No projects yet"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "jobs"
                  ? "Job posts will appear here as recruiters publish them."
                  : "Be the first to share a project with the community."}
              </p>
            </div>
          )}
        </div>

        <div ref={sentinelRef} className="h-10" />
        {query.isFetchingNextPage && (
          <div className="mt-4 space-y-4">
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        )}
        {query.isError && posts.length > 0 && (
          <div className="mt-4">
            <ErrorRetry
              message="Couldn't load more posts."
              onRetry={() => query.fetchNextPage()}
              busy={query.isFetchingNextPage}
              compact
            />
          </div>
        )}
        {!query.hasNextPage && !query.isError && posts.length >= PAGE_SIZE && (
          <div className="py-6 text-center text-xs text-muted-foreground">You're all caught up</div>
        )}
      </main>
    </div>
  );
}

export function ErrorRetry({ message, onRetry, busy, compact }: { message: string; onRetry: () => void; busy?: boolean; compact?: boolean }) {
  return (
    <div className={`glass flex flex-col items-center gap-2 rounded-3xl text-center ${compact ? "p-4" : "p-8"}`}>
      <div className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
      <button
        onClick={onRetry}
        disabled={busy}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        {busy ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

function ShowcaseComposer({ onPosted }: { onPosted: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (!user) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Max 8 MB"); return; }
    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("showcase-media").upload(path, file, { contentType: file.type });
    if (error) { setUploading(false); toast.error(error.message); return; }
    const { data: signed } = await supabase.storage.from("showcase-media").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signed?.signedUrl) setMedia((m) => [...m, signed.signedUrl]);
    setUploading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim() || busy) return;
    const tags = tagsInput.split(",").map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean).slice(0, 8);
    setBusy(true);
    const { error } = await supabase.from("posts").insert({
      kind: "showcase",
      author_id: user.id,
      title: title.trim().slice(0, 140),
      body: body.trim().slice(0, 2000),
      media_urls: media,
      tags,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Posted");
    setTitle(""); setBody(""); setTagsInput(""); setMedia([]);
    onPosted();
  }

  return (
    <form onSubmit={submit} className="mb-4 glass-strong space-y-3 rounded-3xl p-5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Project title"
        maxLength={140}
        required
        className="w-full rounded-2xl border border-border bg-background/60 px-4 py-2.5 text-sm font-medium outline-none focus:border-foreground/30"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did you build? Link to GitHub, demo, case study…"
        rows={3}
        maxLength={2000}
        className="w-full resize-none rounded-2xl border border-border bg-background/60 px-4 py-2.5 text-sm outline-none focus:border-foreground/30"
      />
      <input
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="Tags (comma separated, max 8) e.g. react, design, ml"
        className="w-full rounded-2xl border border-border bg-background/60 px-4 py-2 text-xs outline-none focus:border-foreground/30"
      />

      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((u, i) => (
            <div key={u} className="relative aspect-video overflow-hidden rounded-xl">
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => setMedia(media.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/80 hover:bg-background">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || media.length >= 4}
          className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs hover:bg-secondary/60 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          Add image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
        />
        <button disabled={busy || !title.trim()} className="rounded-full bg-primary px-5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {busy ? "Posting…" : "Share project"}
        </button>
      </div>
    </form>
  );
}
