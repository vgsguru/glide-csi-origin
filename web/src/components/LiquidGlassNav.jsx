import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Activity,
  User,
  LogOut,
  Sun,
  Moon,
  Menu,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import Logo from './Logo';

/**
 * Glide Liquid Glass Navbar — adapted from the Liquid Glass Navbar reference.
 *
 * Layout:  [Glide logo]  [Dashboard | Chat | Activity]  [☰ menu]
 *                                                              └─ dropdown: Settings, Theme, Sign out
 *
 * The active nav item slides a spring-animated glass chip behind it via
 * framer-motion's layoutId="active-glass-chip".
 */

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chat',      label: 'Chat',      icon: MessageSquare  },
  { id: 'activity',  label: 'Activity',  icon: Activity       },
];

export default function LiquidGlassNav({
  currentView,
  setView,
  user,
  onSignOut,
  theme,
  toggleTheme,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    /* Fixed floating bar — pointer-events:none on wrapper so content beneath stays clickable */
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div ref={menuRef} className="pointer-events-auto relative">

        {/* ── Main pill bar ─────────────────────────────────────────────── */}
        <nav
          aria-label="Primary"
          className="glass-panel relative flex w-fit items-center gap-3 rounded-full px-3 py-2"
        >
          {/* Logo / home button */}
          <button
            onClick={() => setView('dashboard')}
            aria-label="Home"
            className="glass-icon-btn ml-1"
          >
            <Logo theme={theme} size={20} className="relative z-10" />
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-white/20 dark:bg-white/10" />

          {/* Primary nav icons */}
          <div className="flex items-center gap-0.5">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = currentView === id;
              return (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  aria-label={label}
                  title={label}
                  className={clsx(
                    'relative grid h-10 w-10 place-items-center rounded-full transition-colors duration-150',
                    active
                      ? 'text-[var(--foreground)]'
                      : 'text-[var(--foreground)]/60 hover:text-[var(--foreground)]'
                  )}
                >
                  {/* Animated glass chip slides behind the active icon */}
                  {active && (
                    <motion.span
                      layoutId="active-glass-chip"
                      className="glass-chip absolute inset-0 rounded-full"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <Icon className="relative z-10 h-[20px] w-[20px]" strokeWidth={2} />
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-white/20 dark:bg-white/10" />

          {/* Menu / overflow button */}
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
            className={clsx(
              'glass-icon-btn mr-1',
              menuOpen ? 'opacity-100' : 'opacity-80'
            )}
          >
            <Menu className="h-[18px] w-[18px] relative z-10" strokeWidth={2} />
          </button>
        </nav>

        {/* ── Dropdown ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="glass-panel absolute right-0 top-full mt-2 flex min-w-[11rem] flex-col gap-0.5 rounded-2xl p-1.5"
            >
              {/* User info header */}
              {user && (
                <>
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-xs font-bold">
                      {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold leading-tight text-[var(--foreground)]">
                        {user.name || 'User'}
                      </p>
                      <p className="truncate text-[10px] text-[var(--foreground)]/50">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="my-1 h-px bg-white/15" />
                </>
              )}

              {/* Settings */}
              <button
                type="button"
                onClick={() => { setView('profile'); setMenuOpen(false); }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[var(--foreground)]/85 transition-colors hover:bg-white/10"
              >
                <User className="h-4 w-4" strokeWidth={2} />
                <span>Settings</span>
              </button>

              {/* Theme toggle */}
              <button
                type="button"
                onClick={() => { toggleTheme(); setMenuOpen(false); }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[var(--foreground)]/85 transition-colors hover:bg-white/10"
              >
                {theme === 'dark'
                  ? <Sun className="h-4 w-4" strokeWidth={2} />
                  : <Moon className="h-4 w-4" strokeWidth={2} />
                }
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </button>

              <div className="my-1 h-px bg-white/15" />

              {/* Sign out */}
              <button
                type="button"
                onClick={() => { onSignOut(); setMenuOpen(false); }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
                <span>Sign out</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
