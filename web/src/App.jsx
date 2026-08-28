import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

import LiquidBackground from './components/LiquidBackground';
import LiquidGlassNav from './components/LiquidGlassNav';
import { LoadingState } from './components/ui';
import Activity from './pages/Activity';
import Auth from './pages/Auth';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import { useAuth } from './hooks/useAuth';

function App() {
  const { user, loading, signOut, markOnboarded, refresh } = useAuth();
  const [view, setView] = useState('landing');
  const [theme, setTheme] = useState(() => localStorage.getItem('glide_theme') || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('glide_theme', theme);
  }, [theme]);

  // Route from auth state.
  useEffect(() => {
    if (loading) return;
    if (user) {
      if (user.isNew) setView('onboarding');
      else if (['landing', 'auth', 'onboarding'].includes(view)) setView('dashboard');
    } else if (!['landing', 'auth'].includes(view)) {
      setView('landing');
    }
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  function handleAuthSuccess(session) {
    setView(session.isNew ? 'onboarding' : 'dashboard');
  }

  async function handleOnboardingComplete() {
    await markOnboarded();
    setView('dashboard');
  }

  const isAppShell = !['landing', 'auth', 'onboarding'].includes(view);

  if (loading) {
    return (
      <div className="bg-ambient min-h-screen w-full text-[var(--foreground)]">
        <LoadingState label="Restoring your session…" />
      </div>
    );
  }

  return (
    <div className="bg-ambient relative min-h-screen w-full font-sans text-[var(--foreground)] transition-colors duration-700">
      <div className={isAppShell ? 'opacity-30 transition-opacity duration-1000' : 'opacity-100 transition-opacity duration-1000'}>
        <LiquidBackground theme={theme} />
      </div>

      {isAppShell ? (
        <div className="relative z-10 min-h-screen">
          <LiquidGlassNav
            currentView={view}
            setView={setView}
            user={user}
            onSignOut={() => { signOut(); setView('landing'); }}
            theme={theme}
            toggleTheme={toggleTheme}
          />

          {/* Keyed fade-in only. An AnimatePresence with mode="wait" stalls here:
              the pages animate their own children with variants, the parent's
              exit never resolves, and the next page never mounts. */}
          <main className="min-h-screen pt-20">
            <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              {view === 'dashboard' && <Dashboard user={user} />}
              {view === 'chat' && <Chat theme={theme} />}
              {view === 'activity' && <Activity />}
              {view === 'profile' && <Profile onChanged={refresh} />}
            </motion.div>
          </main>
        </div>
      ) : (
        <div className="relative z-10 min-h-screen w-full">
          {view === 'landing' && (
            <Landing key="landing" onGetStarted={() => setView('auth')} theme={theme} toggleTheme={toggleTheme} />
          )}
          {view === 'auth' && (
            <Auth key="auth" theme={theme} onSuccess={handleAuthSuccess} onBack={() => setView('landing')} />
          )}
          {view === 'onboarding' && (
            <div key="onboarding" className="flex min-h-screen items-center justify-center">
              <Onboarding theme={theme} onComplete={handleOnboardingComplete} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
