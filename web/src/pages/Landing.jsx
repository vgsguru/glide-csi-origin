import { motion } from 'framer-motion';
import { Brain, Sun, Moon, Database, Smartphone, Lock, Eye, Hammer, Cpu, Server, Sparkles, Code, ArrowRight } from 'lucide-react';
import Logo from '../components/Logo';

export default function Landing({ onGetStarted, theme, toggleTheme }) {
  const team = [
    {
      role: 'Team Lead',
      name: 'Guru Sanjeeth',
      degree: 'B.E. CSE (AI/ML)',
      college: 'VEL TECH HIGH TECH ENGINEERING COLLEGE',
      image: '/guru.jpg'
    },
    {
      role: 'Team Member',
      name: 'Hema Dheeksha',
      degree: 'B.E. CSE',
      college: 'VEL TECH HIGH TECH ENGINEERING COLLEGE',
      image: '/hema.jpg'
    },
    {
      role: 'Team Member',
      name: 'Harini Nadar',
      degree: 'B.E. CSE',
      college: 'VEL TECH HIGH TECH ENGINEERING COLLEGE',
      image: '/harini.jpg'
    },
    {
      role: 'Team Member',
      name: 'DIVYA SAI',
      degree: 'B.E. CSE',
      college: 'VEL TECH HIGH TECH ENGINEERING COLLEGE',
      image: '/divya.jpg'
    }
  ];

  const techStack = [
    { title: 'React', icon: Code },
    { title: 'Kotlin', icon: Smartphone },
    { title: 'Llama/Gemma', icon: Cpu },
    { title: 'FastAPI', icon: Server },
    { title: 'SQLite', icon: Database },
  ];

  return (
    <div className="bg-ambient min-h-screen text-[var(--foreground)]">
      
      {/* Navbar */}
      <header className="fixed top-0 z-40 w-full px-4 pt-4">
        <div className="glass-panel mx-auto flex max-w-7xl items-center justify-between rounded-full px-3 py-2 sm:px-5 sm:py-2.5">
          <div className="flex items-center gap-2 pl-2">
            <Logo theme={theme} size={26} />
            <span className="font-display text-lg font-semibold tracking-tight text-[var(--foreground)]">Glide</span>
          </div>
          <nav className="hidden items-center gap-6 md:flex text-sm font-medium">
            <a href="#problem" className="text-[var(--foreground)] hover:text-[var(--primary)] transition">Problem</a>
            <a href="#solution" className="text-[var(--foreground)] hover:text-[var(--primary)] transition">Solution</a>
            <a href="#innovations" className="text-[var(--foreground)] hover:text-[var(--primary)] transition">Innovations</a>
            <a href="#team" className="text-[var(--foreground)] hover:text-[var(--primary)] transition">Team</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="grid h-8 w-8 place-items-center rounded-full text-[var(--foreground)] hover:bg-[var(--secondary)] transition">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={onGetStarted} className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition">
              Enter App
            </button>
          </div>
        </div>
      </header>

      {/* Hero Video Banner */}
      <section className="relative h-screen w-full overflow-hidden flex items-end justify-center pb-12">
        <video 
          autoPlay 
          loop 
          muted 
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/banner.mp4" type="video/mp4" />
        </video>
        
        <div className="relative z-10 text-center px-4 max-w-4xl">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="font-display text-4xl font-bold tracking-tight sm:text-5xl mb-4 text-white drop-shadow-lg"
          >
            Autonomous Financial Management
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-base sm:text-lg text-gray-200 drop-shadow mb-8"
          >
            For variable-income users, gig workers, and young earners.
          </motion.p>
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            onClick={onGetStarted}
            className="rounded-full bg-white text-black px-6 py-2.5 text-sm font-bold hover:bg-gray-100 transition shadow-xl"
          >
            Get Started
          </motion.button>
        </div>
      </section>

      {/* Problem Statement */}
      <section id="problem" className="py-24 px-4">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-3xl font-bold mb-8 text-center sm:text-4xl">The Problem</h2>
          <div className="glass-strong rounded-3xl p-8 sm:p-12 text-[var(--muted-foreground)] leading-relaxed space-y-6 text-lg">
            <p>
              Millions of individuals, particularly gig workers, freelancers, informal-sector workers, and young earners, experience highly variable income and irregular expenses. Their financial activity is fragmented across bank accounts, SMS notifications, bills, receipts, and investment records, making it difficult to maintain a consistent and accurate understanding of their overall financial position.
            </p>
            <p>
              Traditional personal-finance applications primarily function as dashboards for tracking historical transactions. They often depend on users to manually categorise transactions, establish budgets, monitor accounts, identify recurring obligations, and interpret financial information. As a result, the user remains responsible for continuously analysing their own financial situation and deciding what action to take.
            </p>
            <p className="font-medium text-[var(--foreground)]">
              The core gap is the absence of a system that can continuously construct and maintain a coherent model of an individual's evolving financial state from fragmented and heterogeneous financial information.
            </p>
          </div>
        </div>
      </section>

      {/* Our Solution */}
      <section id="solution" className="py-24 px-4 bg-[var(--secondary)]/30">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-3xl font-bold mb-8 text-center sm:text-4xl">Our Solution</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="glass rounded-3xl p-8">
              <Sparkles className="h-8 w-8 text-[var(--primary)] mb-4" />
              <h3 className="font-display text-xl font-bold mb-3">Agentic AI Engine</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                An autonomous system that continuously transforms fragmented financial information into an evolving model of your state.
              </p>
            </div>
            <div className="glass rounded-3xl p-8">
              <Lock className="h-8 w-8 text-[var(--primary)] mb-4" />
              <h3 className="font-display text-xl font-bold mb-3">On-Device Privacy</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                Your SMS notifications and financial data never leave your device. All parsing and tracking runs securely and locally.
              </p>
            </div>
            <div className="glass rounded-3xl p-8">
              <Brain className="h-8 w-8 text-[var(--primary)] mb-4" />
              <h3 className="font-display text-xl font-bold mb-3">Proactive Decision Support</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                Move from reactive tracking to proactive assistance. Get contextual advice on upcoming obligations and income variability.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section id="techstack" className="py-24 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-display text-3xl font-bold mb-12 sm:text-4xl">Tech Stack</h2>
          <div className="flex flex-wrap justify-center gap-6">
            {techStack.map((tech, i) => (
              <div key={i} className="glass rounded-2xl flex flex-col items-center justify-center p-6 w-32 h-32 hover:-translate-y-1 transition duration-300">
                <tech.icon className="h-8 w-8 mb-3 text-[var(--primary)]" />
                <span className="font-medium text-sm">{tech.title}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Innovative Solution */}
      <section id="innovations" className="py-24 px-4 bg-[var(--secondary)]/30">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-3xl font-bold mb-12 text-center sm:text-4xl">Innovative Solutions</h2>
          <div className="grid gap-8 sm:grid-cols-2">
            <div className="glass-strong rounded-3xl p-8 border border-[var(--primary)]/20 relative overflow-hidden">
              <div className="absolute -right-10 -top-10 opacity-5">
                <Hammer className="h-64 w-64" />
              </div>
              <h3 className="font-display text-2xl font-bold mb-4 relative z-10">Money Bucket</h3>
              <p className="text-[var(--muted-foreground)] relative z-10">
                A separate intelligent section that automatically stores the withdrawn amount and seamlessly updates with real-time transaction data to keep your physical and digital finances synchronized.
              </p>
            </div>
            <div className="glass-strong rounded-3xl p-8 border border-[var(--primary)]/20 relative overflow-hidden">
              <div className="absolute right-4 top-4 bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-bold px-3 py-1 rounded-full z-10">
                Coming Soon
              </div>
              <div className="absolute -right-10 -top-10 opacity-5">
                <Eye className="h-64 w-64" />
              </div>
              <h3 className="font-display text-2xl font-bold mb-4 relative z-10 opacity-80">AR Integration</h3>
              <p className="text-[var(--muted-foreground)] relative z-10 opacity-80">
                Visualize your financial data in augmented reality. Bring your budgets and expense tracking into the physical world for an immersive financial management experience.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Team Details */}
      <section id="team" className="py-32 px-4 bg-[#050505] text-white mt-12 border-t border-[var(--border)]">
        <div className="mx-auto max-w-6xl">
          
          <div className="flex flex-col items-center justify-center text-center mb-16">
            <div className="text-[10px] font-bold tracking-widest uppercase border border-gray-800 rounded-full px-4 py-1.5 mb-6 text-gray-400">
              MEINEWELT-CRUX
            </div>
            <h2 className="font-display text-5xl font-bold mb-4">Our team</h2>
            <p className="text-gray-400 text-lg">The people building Crux.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((member, i) => (
              <div key={i} className="group relative rounded-3xl overflow-hidden border border-gray-800 bg-[#0a0a0a] aspect-[3/4]">
                <div className="absolute top-4 left-4 z-10">
                  <span className="text-[10px] font-bold tracking-widest border border-gray-700 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 text-white">
                    {member.role}
                  </span>
                </div>
                
                <img 
                  src={member.image} 
                  alt={member.name}
                  className="absolute inset-0 w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 group-hover:scale-105 transition duration-700"
                />
                
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <h3 className="text-xl font-bold mb-2">{member.name}</h3>
                  <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">{member.degree}</p>
                  <p className="text-[9px] font-bold tracking-wider text-gray-500 uppercase">{member.college}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black border-t border-gray-900 px-4 py-12 text-center text-sm text-gray-500">
        <div className="flex justify-center mb-6">
          <Logo theme="dark" size={32} />
        </div>
        <p>CSI ORIGIN 2026 — Autonomous Financial Management</p>
        <p className="mt-2 text-xs">Built for people with variable income who deserve financial clarity.</p>
      </footer>
    </div>
  );
}
