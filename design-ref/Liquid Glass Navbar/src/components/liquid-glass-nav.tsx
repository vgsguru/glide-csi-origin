import { useState, useRef, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home as HomeIcon,
  Briefcase,
  Rss,
  User,
  Bell,
  LogOut,
  Menu,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

type NavItem = {
  to: "/" | "/jobs" | "/feed";
  Icon: typeof HomeIcon;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", Icon: HomeIcon },
  { to: "/jobs", Icon: Briefcase },
  { to: "/feed", Icon: Rss },
];

export function LiquidGlassNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div ref={menuRef} className="pointer-events-auto relative">
        <nav
          aria-label="Primary"
          className="glass-panel relative flex w-fit items-center justify-between gap-3 rounded-full px-3 py-2"
        >
          {/* Left: Logo */}
          <Link
            to="/"
            aria-label="Home"
            className="glass-icon-btn ml-1 flex h-10 w-10 items-center justify-center rounded-full text-foreground"
          >
            <span className="text-base font-black tracking-tight">C</span>
          </Link>

          {/* Center: primary nav */}
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map(({ to, Icon }) => {
              const active =
                to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "relative grid h-10 w-10 place-items-center rounded-full transition-colors",
                    active
                      ? "text-foreground"
                      : "text-foreground/65 hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="active-glass-chip"
                      className="glass-chip absolute inset-0 rounded-full"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <Icon className="relative z-10 h-[22px] w-[22px]" strokeWidth={2} />
                </Link>
              );
            })}
          </div>

          {/* Right: Menu button */}
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className={cn(
              "glass-icon-btn mr-1 flex h-10 w-10 items-center justify-center rounded-full",
              menuOpen ? "text-foreground" : "text-foreground/80 hover:text-foreground",
            )}
          >
            <Menu className="h-[20px] w-[20px]" strokeWidth={2} />
          </button>
        </nav>

        {/* Dropdown rendered as sibling so the nav's overflow:hidden doesn't clip it */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="glass-panel absolute right-0 top-full mt-2 flex min-w-[10rem] flex-col gap-1 rounded-2xl p-2"
            >
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground/90 transition-colors hover:bg-white/10"
              >
                <User className="h-4 w-4" strokeWidth={2} />
                <span>Profile</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground/90 transition-colors hover:bg-white/10"
              >
                <Bell className="h-4 w-4" strokeWidth={2} />
                <span>Notifications</span>
              </button>
              <div className="my-1 h-px bg-white/15" />
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground/90 transition-colors hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
                <span>Log out</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

