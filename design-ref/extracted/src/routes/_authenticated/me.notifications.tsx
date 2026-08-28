import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { markNotificationRead } from "@/lib/messaging.functions";
import { ArrowLeft, CheckCheck, Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me/notifications")({
  component: NotificationsPage,
});

type N = { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

function NotificationsPage() {
  const qc = useQueryClient();
  const markFn = useServerFn(markNotificationRead);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await supabase.from("notifications").select("id, kind, title, body, link, created_at, read_at").order("created_at", { ascending: false }).limit(100)).data as N[] | null,
  });
  const markAll = useMutation({
    mutationFn: async () => markFn({ data: { all: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const mark = useMutation({
    mutationFn: async (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="bg-ambient min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Home</Link>
        <div className="mt-3 flex items-end justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tight">Notifications</h1>
          <button onClick={() => markAll.mutate()} className="glass inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs hover:bg-secondary/60"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>
        </div>

        <div className="mt-6 space-y-2">
          {(!data || data.length === 0) && <div className="glass rounded-3xl p-10 text-center text-sm text-muted-foreground"><Bell className="mx-auto mb-3 h-5 w-5" />No notifications.</div>}
          {data?.map((n) => (
            <div key={n.id} className={`glass rounded-2xl p-4 ${n.read_at ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold">{n.title}</p>
                  {n.body && <p className="mt-1 text-xs text-foreground/80">{n.body}</p>}
                  <p className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-1">
                  {n.link && <a href={n.link} className="rounded-full bg-secondary px-3 py-1 text-xs">Open</a>}
                  {!n.read_at && <button onClick={() => mark.mutate(n.id)} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"><CheckCheck className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
