import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, Sparkles } from "lucide-react";

export function SiteNav() {
  const { user, isRecruiter } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const linkCls =
    "rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      <div className="glass mx-auto flex max-w-5xl items-center justify-between rounded-full px-3 py-2 sm:px-5 sm:py-2.5">
        <Link to="/" className="flex items-center gap-2 pl-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">Lumen</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <Link to="/" className={linkCls} activeOptions={{ exact: true }} activeProps={{ className: "rounded-full px-3 py-1.5 text-sm text-foreground bg-secondary" }}>
            Jobs
          </Link>
          {user && (
            <Link to="/feed" search={{ tab: "jobs" }} className={linkCls}>
              Feed
            </Link>
          )}
          {user && !isRecruiter && (
            <Link to="/me/applications" className={linkCls}>
              My applications
            </Link>
          )}
          {user && isRecruiter && (
            <Link to="/recruiter" className={linkCls}>
              Recruiter
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-1">
          {user ? (
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : (
            <Link
              to="/auth"
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
