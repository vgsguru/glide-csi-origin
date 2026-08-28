import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Share2, Briefcase, Send, Trash2, Loader2, X, MessagesSquare, HeartOff, AlertTriangle, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export function PostCardSkeleton() {
  return (
    <article className="glass-strong rounded-3xl p-5 sm:p-6">
      <header className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </header>
      <Skeleton className="mt-4 h-5 w-3/4" />
      <Skeleton className="mt-2 h-3 w-full" />
      <Skeleton className="mt-1.5 h-3 w-5/6" />
      <Skeleton className="mt-3 aspect-video w-full rounded-2xl" />
      <div className="mt-4 flex gap-4 border-t border-border/60 pt-3">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-10" />
      </div>
    </article>
  );
}

function CommentSkeleton() {
  return (
    <div className="flex items-start gap-2">
      <Skeleton className="h-7 w-7 rounded-full" />
      <div className="flex-1 space-y-2 rounded-2xl bg-secondary/40 px-3 py-2">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function LikerSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl p-2">
      <Skeleton className="h-8 w-8 rounded-full" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export type FeedPost = {
  id: string;
  kind: "job" | "showcase";
  author_id: string;
  company_id: string | null;
  job_id: string | null;
  title: string;
  body: string;
  media_urls: string[];
  tags: string[];
  like_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  viewer_liked: boolean;
  author?: { full_name: string | null; avatar_url: string | null } | null;
  company?: { name: string; logo_url: string | null } | null;
};

type Comment = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: { full_name: string | null; avatar_url: string | null } | null;
};

type Liker = {
  user_id: string;
  created_at: string;
  profile?: { full_name: string | null; avatar_url: string | null } | null;
};

const COMMENTS_PAGE = 5;
const LIKES_PAGE = 20;

async function fetchProfiles(ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

export function PostCard({ post, onChange }: { post: FeedPost; onChange?: () => void }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.viewer_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [commentsHasMore, setCommentsHasMore] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [busy, setBusy] = useState(false);
  const [showLikers, setShowLikers] = useState(false);

  const [likeBusy, setLikeBusy] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  // Polite live-region announcements (likes, comment pagination, retry/error states).
  const [liveMessage, setLiveMessage] = useState("");
  const announce = useCallback((msg: string) => {
    setLiveMessage("");
    // Re-set on next tick so screen readers re-announce identical strings.
    requestAnimationFrame(() => setLiveMessage(msg));
  }, []);

  const likersTriggerRef = useRef<HTMLButtonElement>(null);

  async function toggleLike() {
    if (!user || likeBusy) return;
    const prevLiked = liked;
    const prevCount = likeCount;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    setLikeBusy(true);
    announce(next ? "Liking post…" : "Removing like…");
    const { error } = next
      ? await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id })
      : await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    setLikeBusy(false);
    if (error) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      toast.error(next ? "Couldn't like post" : "Couldn't unlike post");
      announce(next ? "Couldn't like post. Reverted." : "Couldn't unlike post. Reverted.");
    } else {
      announce(next ? "Liked." : "Like removed.");
    }
  }

  async function loadCommentsPage(cursor: string | null) {
    setCommentsLoading(true);
    setCommentsError(null);
    announce(cursor ? "Loading more comments…" : "Loading comments…");
    let q = supabase
      .from("post_comments")
      .select("id, author_id, body, created_at")
      .eq("post_id", post.id)
      .order("created_at", { ascending: false })
      .limit(COMMENTS_PAGE);
    if (cursor) q = q.lt("created_at", cursor);
    const { data, error } = await q;
    setCommentsLoading(false);
    if (error) {
      setCommentsError(error.message);
      announce("Failed to load comments. Retry available.");
      return;
    }
    const rows = (data ?? []) as Array<Omit<Comment, "author">>;
    const pmap = await fetchProfiles([...new Set(rows.map((r) => r.author_id))]);
    const enriched = rows.map((r) => ({ ...r, author: pmap.get(r.author_id) ?? null }));
    setComments((prev) => cursor ? [...prev, ...enriched] : enriched);
    setCommentsHasMore(rows.length === COMMENTS_PAGE);
    if (rows.length) setCommentsCursor(rows[rows.length - 1].created_at);
    announce(rows.length === 0 ? "No comments." : `Loaded ${rows.length} comment${rows.length === 1 ? "" : "s"}.`);
  }

  async function openComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) await loadCommentsPage(null);
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body || !user || busy) return;
    if (body.length > 1000) { toast.error("Comment too long (max 1000)"); return; }
    setBusy(true);
    const { data, error } = await supabase
      .from("post_comments")
      .insert({ post_id: post.id, author_id: user.id, body })
      .select("id, author_id, body, created_at")
      .single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    setCommentText("");
    setCommentCount((c) => c + 1);
    const pmap = await fetchProfiles([user.id]);
    setComments((prev) => [{ ...(data as Comment), author: pmap.get(user.id) ?? null }, ...prev]);
    announce("Comment posted.");
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from("post_comments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCommentCount((c) => Math.max(c - 1, 0));
    setComments((prev) => prev.filter((c) => c.id !== id));
    announce("Comment deleted.");
  }

  async function share() {
    const url = post.kind === "job" && post.job_id
      ? `${window.location.origin}/jobs/${post.job_id}`
      : `${window.location.origin}/feed?post=${post.id}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); } catch { toast.error("Copy failed"); }
    if (user) await supabase.from("post_shares").insert({ post_id: post.id, user_id: user.id });
    onChange?.();
  }

  function onLikeKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    // Native <button> already toggles on Enter/Space, but make it explicit
    // and prevent page-scroll on Space.
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      void toggleLike();
    }
  }

  const initials = (post.author?.full_name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <article className="glass-strong rounded-3xl p-5 sm:p-6">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>

      <header className="flex items-center gap-3">
        {post.author?.avatar_url ? (
          <img src={post.author.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-medium">{initials || "?"}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{post.author?.full_name ?? "Anonymous"}</span>
            {post.kind === "job" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Briefcase className="h-3 w-3" /> Hiring
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {post.company?.name ? <>{post.company.name} · </> : null}
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </div>
        </div>
      </header>

      <h3 className="mt-4 font-display text-lg font-semibold leading-snug">{post.title}</h3>
      {post.body && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{post.body}</p>}

      {post.media_urls.length > 0 && (
        <div className={`mt-3 grid gap-2 ${post.media_urls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {post.media_urls.slice(0, 4).map((u, i) => (
            <img key={i} src={u} alt="" className="aspect-video w-full rounded-2xl object-cover" />
          ))}
        </div>
      )}

      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] text-muted-foreground">#{t}</span>
          ))}
        </div>
      )}

      {post.kind === "job" && post.job_id && (
        <div className="mt-4 flex gap-2">
          <Link to="/jobs/$jobId" params={{ jobId: post.job_id }} className="glass rounded-full px-4 py-2 text-xs hover:bg-secondary/60">View job</Link>
          <Link to="/apply/$jobId" params={{ jobId: post.job_id }} className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">Apply</Link>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={toggleLike}
          onKeyDown={onLikeKey}
          disabled={likeBusy || !user}
          aria-pressed={liked}
          aria-busy={likeBusy}
          aria-label={liked ? `Unlike post, ${likeCount} likes` : `Like post, ${likeCount} likes`}
          title="Like (Enter or Space)"
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70 disabled:cursor-not-allowed ${liked ? "text-foreground" : ""}`}
        >
          {likeBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} aria-hidden="true" />}
        </button>
        <button
          ref={likersTriggerRef}
          type="button"
          onClick={() => { if (likeCount > 0) setShowLikers(true); }}
          disabled={likeCount === 0}
          aria-label={`View ${likeCount} likes`}
          aria-haspopup="dialog"
          className="rounded-full px-1 py-1 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:no-underline"
        >
          {likeCount}
        </button>
        <button
          type="button"
          onClick={openComments}
          aria-expanded={showComments}
          aria-controls={`comments-${post.id}`}
          aria-label={`${showComments ? "Hide" : "Show"} comments, ${commentCount} total`}
          className="ml-2 flex items-center gap-1.5 rounded-full px-2 py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> {commentCount}
        </button>
        <button
          type="button"
          onClick={share}
          aria-label={`Share post, ${post.share_count} shares`}
          className="flex items-center gap-1.5 rounded-full px-2 py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" /> {post.share_count}
        </button>
      </div>

      {showComments && (
        <div id={`comments-${post.id}`} className="mt-3 space-y-3">
          <form onSubmit={addComment} className="flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment…"
              maxLength={1000}
              aria-label="Write a comment"
              className="flex-1 rounded-full border border-border bg-background/60 px-4 py-2 text-sm outline-none focus:border-foreground/30"
            />
            <button type="submit" disabled={busy || !commentText.trim()} aria-label="Submit comment" className="rounded-full bg-primary px-3 text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
          {commentsLoading && comments.length === 0 && (
            <div className="space-y-2" aria-busy="true">
              <CommentSkeleton />
              <CommentSkeleton />
            </div>
          )}
          {commentsError && comments.length === 0 && !commentsLoading && (
            <InlineRetry message="Couldn't load comments." onRetry={() => loadCommentsPage(null)} />
          )}
          {!commentsLoading && !commentsError && comments.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border/60 py-6 text-muted-foreground">
              <MessagesSquare className="h-5 w-5" />
              <span className="text-xs">No comments yet. Be the first.</span>
            </div>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 text-sm">
              {c.author?.avatar_url ? (
                <img src={c.author.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-[10px]">
                  {(c.author?.full_name ?? "?").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 rounded-2xl bg-secondary/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{c.author?.full_name ?? "User"}</span>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                    {user?.id === c.author_id && (
                      <button type="button" onClick={() => deleteComment(c.id)} aria-label="Delete comment" className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"><Trash2 className="h-3 w-3" aria-hidden="true" /></button>
                    )}
                  </div>
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{c.body}</div>
              </div>
            </div>
          ))}
          {commentsLoading && comments.length > 0 && <CommentSkeleton />}
          {commentsError && comments.length > 0 && !commentsLoading && (
            <InlineRetry message="Couldn't load more comments." onRetry={() => loadCommentsPage(commentsCursor)} />
          )}
          {commentsHasMore && comments.length > 0 && !commentsLoading && !commentsError && (
            <button
              type="button"
              onClick={() => loadCommentsPage(commentsCursor)}
              aria-label="Load more comments"
              className="w-full rounded-full border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Load more comments
            </button>
          )}
        </div>
      )}

      {showLikers && (
        <LikersModal
          postId={post.id}
          onClose={() => {
            setShowLikers(false);
            // Restore focus to the element that opened the modal.
            requestAnimationFrame(() => likersTriggerRef.current?.focus());
          }}
        />
      )}
    </article>
  );
}

function InlineRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }}
        disabled={busy}
        aria-busy={busy}
        aria-label={`Retry: ${message}`}
        className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RotateCw className="h-3 w-3" aria-hidden="true" />}
        Retry
      </button>
    </div>
  );
}

function LikersModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [likers, setLikers] = useState<Liker[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const announce = useCallback((msg: string) => {
    setLiveMessage("");
    requestAnimationFrame(() => setLiveMessage(msg));
  }, []);

  async function loadPage(c: string | null) {
    setLoading(true);
    setError(null);
    announce(c ? "Loading more likes…" : "Loading likes…");
    let q = supabase
      .from("post_likes")
      .select("user_id, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(LIKES_PAGE);
    if (c) q = q.lt("created_at", c);
    const { data, error: err } = await q;
    setLoading(false);
    if (err) {
      setError(err.message);
      announce("Failed to load likes. Retry available.");
      return;
    }
    const rows = (data ?? []) as Array<{ user_id: string; created_at: string }>;
    const pmap = await fetchProfiles([...new Set(rows.map((r) => r.user_id))]);
    const enriched: Liker[] = rows.map((r) => ({ ...r, profile: pmap.get(r.user_id) ?? null }));
    setLikers((prev) => c ? [...prev, ...enriched] : enriched);
    setHasMore(rows.length === LIKES_PAGE);
    if (rows.length) setCursor(rows[rows.length - 1].created_at);
    announce(rows.length === 0 ? "No likes." : `Loaded ${rows.length} like${rows.length === 1 ? "" : "s"}.`);
  }

  useEffect(() => { loadPage(null); /* eslint-disable-next-line */ }, []);

  // Focus management + body scroll lock + Escape to close.
  useEffect(() => {
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      // Focus trap — keep Tab within the dialog.
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (active && !dialogRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading && !error) loadPage(cursor);
    }, { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, cursor, error]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="likers-modal-title"
        className="glass-strong w-full max-w-sm rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {liveMessage}
        </div>
        <div className="flex items-center justify-between">
          <h3 id="likers-modal-title" className="font-display text-lg font-semibold">Likes</h3>
          <button ref={closeBtnRef} type="button" onClick={onClose} aria-label="Close likes dialog (Escape)" title="Close (Esc)" className="grid h-8 w-8 place-items-center rounded-full hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto" aria-busy={loading}>
          {loading && likers.length === 0 && (
            <>
              <LikerSkeleton />
              <LikerSkeleton />
              <LikerSkeleton />
            </>
          )}
          {error && likers.length === 0 && !loading && (
            <InlineRetry message="Couldn't load likes." onRetry={() => loadPage(null)} />
          )}
          {!loading && !error && likers.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 py-8 text-muted-foreground">
              <HeartOff className="h-5 w-5" />
              <span className="text-sm">No likes yet</span>
            </div>
          )}
          {likers.map((l) => (
            <div key={l.user_id + l.created_at} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-secondary/60">
              {l.profile?.avatar_url ? (
                <img src={l.profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-[10px]">{(l.profile?.full_name ?? "?").slice(0, 2).toUpperCase()}</div>
              )}
              <span className="text-sm">{l.profile?.full_name ?? "User"}</span>
            </div>
          ))}
          {loading && likers.length > 0 && <LikerSkeleton />}
          {error && likers.length > 0 && !loading && (
            <InlineRetry message="Couldn't load more likes." onRetry={() => loadPage(cursor)} />
          )}
          <div ref={sentinelRef} className="h-2" />
        </div>
      </div>
    </div>
  );
}
