import { LayoutDashboard, MessageSquare, Activity, User, LogOut, Sparkles, Sun, Moon } from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chat',      label: 'AI Assistant', icon: MessageSquare },
  { id: 'activity',  label: 'Agent Log', icon: Activity },
  { id: 'profile',   label: 'Settings', icon: User },
];

export default function Sidebar({ currentView, setView, user, onSignOut, theme, toggleTheme }) {
  return (
    <aside className="w-20 md:w-64 h-screen fixed left-0 top-0 glass flex flex-col pt-6 pb-8 px-3 z-40 transition-all border-r border-[var(--glass-border)]">

      {/* Brand */}
      <div className="flex items-center gap-2.5 px-3 mb-8">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex-shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="hidden md:block font-display text-lg font-semibold tracking-tight">Glide</span>
      </div>

      {/* User info */}
      {user && (
        <div className="hidden md:flex items-center gap-3 px-3 mb-6 pb-6 border-b border-[var(--border)]">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--secondary)] text-[var(--foreground)] flex-shrink-0 text-sm font-semibold">
            {(user.name || user.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name || 'User'}</p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">{user.email}</p>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex flex-col gap-1.5 flex-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all font-medium text-sm',
              currentView === item.id
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]'
            )}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span className="hidden md:block">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex flex-col gap-2 px-1">
        {/* Engine status */}
        <div className="hidden md:flex items-center gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          <span>Gemma 4 · Local</span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
          <span className="hidden md:block">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>

        {/* Sign out */}
        <button
          onClick={onSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-500/10 transition"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className="hidden md:block">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
