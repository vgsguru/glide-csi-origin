import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Brain, ShieldCheck, TrendingUp, Sun, Moon } from 'lucide-react';
import Logo from '../components/Logo';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
];

const FEATURES = [
  {
    icon: Brain,
    title: 'AI Arbitrator',
    body: 'A local Gemma 4 agent continuously evaluates your cash flow against your priorities and blocks impulse decisions.',
  },
  {
    icon: TrendingUp,
    title: 'Projection Engine',
    body: 'Variable income modelled day-by-day. Know your safe-to-spend before you swipe.',
  },
  {
    icon: ShieldCheck,
    title: '100 % On-Device',
    body: 'SMS and bank data never leave your machine. The engine runs fully offline with Ollama.',
  },
];

const HOW_STEPS = [
  { step: '01', title: 'Set your priorities', desc: 'Tell Glide what matters — rent, SIP, buffer. The Arbitrator protects these first.' },
  { step: '02', title: 'Connect your data', desc: 'Link SMS and email statements locally. No cloud, no third party.' },
  { step: '03', title: 'Let the engine run', desc: 'Glide tracks every rupee in real time and nudges you before you overspend.' },
];

export default function Landing({ onGetStarted, theme, toggleTheme }) {
  return (
    <div className="bg-ambient min-h-screen text-[var(--foreground)]">

      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="glass mx-auto flex max-w-5xl items-center justify-between rounded-full px-3 py-2 sm:px-5 sm:py-2.5">
          {/* Logo */}
          <div className="flex items-center gap-2 pl-2">
            <Logo theme={theme} size={26} />
            <span className="font-display text-lg font-semibold tracking-tight">Glide</span>
          </div>

          {/* Links */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="rounded-full px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={onGetStarted}
              className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="px-4 pt-20 pb-28 sm:pt-28">
        <div className="mx-auto max-w-5xl text-center">

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="glass mx-auto inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-[var(--muted-foreground)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Autonomous financial engine · Gemma 4 local
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-6 font-display text-5xl font-bold tracking-tight sm:text-7xl"
          >
            Financial state,
            <br />
            <span className="text-[var(--muted-foreground)] opacity-40">automated.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mx-auto mt-6 max-w-2xl text-base text-[var(--muted-foreground)] sm:text-lg"
          >
            The AI that continuously adapts to your variable income, projecting your future and
            protecting your priorities — all on-device, all private.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <button
              onClick={onGetStarted}
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition"
            >
              Get started <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
            <a
              href="#features"
              className="glass inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition"
            >
              See features
            </a>
          </motion.div>
        </div>

        {/* Hero feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="relative mx-auto mt-20 max-w-5xl"
        >
          <div className="glass-strong rounded-3xl p-2">
            <div className="grid gap-2 sm:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="glass rounded-2xl p-5">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section id="how" className="px-4 pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              How Glide works
            </h2>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              Three steps to a smarter financial state.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {HOW_STEPS.map(({ step, title, desc }) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="glass rounded-3xl p-6"
              >
                <span className="font-display text-4xl font-bold text-[var(--muted-foreground)] opacity-20">
                  {step}
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ─────────────────────────────────────────────────────── */}
      <section id="features" className="px-4 pb-32">
        <div className="mx-auto max-w-5xl">
          <div className="glass-strong rounded-3xl px-8 py-16 text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Ready to take control?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--muted-foreground)]">
              Join Glide and let the autonomous engine handle the math — so you can focus on what matters.
            </p>
            <button
              onClick={onGetStarted}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-7 py-3.5 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90 transition"
            >
              Create your account <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] px-4 py-8 text-center text-xs text-[var(--muted-foreground)]">
        Glide · Built for people with variable income who deserve financial clarity.
      </footer>
    </div>
  );
}
