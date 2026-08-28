import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, HardDrive, Smartphone, Trash2, Download, QrCode, User as UserIcon, Check } from 'lucide-react';
import clsx from 'clsx';

export default function Profile() {
  const [showQR, setShowQR] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Mock save function
  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 1000);
  };

  return (
    <div className="max-w-4xl w-full mx-auto p-6 pt-24 space-y-8 pb-32">
      
      {/* Header & Identity */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-black to-gray-500 dark:from-white dark:to-gray-300 flex items-center justify-center text-white dark:text-black shadow-lg">
            <UserIcon className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-1">Alex Morgan</h1>
            <p className="text-black/60 dark:text-white/60 font-medium">alex.morgan@example.com</p>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          className="px-6 py-3 bg-black text-white dark:bg-white dark:text-black rounded-full font-semibold hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
        >
          {isSaving ? <Check className="w-5 h-5" /> : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Financial Profile */}
        <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 md:p-8 flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-bold mb-6">Financial Context</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium opacity-70 mb-1.5">Income Archetype</label>
                <select className="w-full bg-white/50 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-black dark:focus:border-white transition-colors appearance-none font-medium">
                  <option>Freelancer / Contractor</option>
                  <option>Gig Worker (Uber, Zomato)</option>
                  <option>Salaried + Side Hustle</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium opacity-70 mb-1.5">Top Priorities (Protected)</label>
                <div className="flex flex-wrap gap-2">
                  {['Emergency Buffer', 'House Rent', 'Mutual Fund SIP'].map(tag => (
                    <span key={tag} className="px-3 py-1.5 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg text-sm font-medium">
                      {tag}
                    </span>
                  ))}
                  <button className="px-3 py-1.5 border border-dashed border-black/30 dark:border-white/30 rounded-lg text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    + Add Priority
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Engine Config */}
        <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <HardDrive className="w-6 h-6" />
            <h2 className="text-xl font-bold">Local LLM Engine</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium opacity-70 mb-1.5">Ollama Endpoint URL</label>
              <input 
                type="text" 
                defaultValue="http://127.0.0.1:11434"
                className="w-full bg-white/50 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium opacity-70 mb-1.5">Active Model</label>
              <select className="w-full bg-white/50 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-black dark:focus:border-white transition-colors appearance-none font-medium">
                <option>gemma4:12b (Recommended)</option>
                <option>gemma4:e2b</option>
              </select>
            </div>
          </div>
        </div>

        {/* Risk & Priorities */}
        <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="w-6 h-6" />
            <h2 className="text-xl font-bold">Arbitrator Rules</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="flex justify-between text-sm font-medium mb-3">
                <span>Risk Tolerance</span>
                <span className="font-bold">Conservative (20%)</span>
              </label>
              <input 
                type="range" 
                min="0" max="100" defaultValue="20"
                className="w-full h-2 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
              />
              <p className="text-xs opacity-60 mt-3 leading-relaxed">
                At Conservative, the AI will aggressively suppress discretionary spending if irregular income drops, heavily prioritizing your Emergency Buffer.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Android Client sync */}
          <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 md:p-8 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-black/5 dark:bg-white/5">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Android Sync</h3>
                  <p className="text-sm opacity-60">Status: Disconnected</p>
                </div>
              </div>
              <button 
                onClick={() => setShowQR(!showQR)}
                className={clsx(
                  "px-4 py-2 rounded-full border border-black/20 dark:border-white/20 transition-all font-medium text-sm flex items-center gap-2",
                  showQR ? "bg-black text-white dark:bg-white dark:text-black" : "hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                <QrCode className="w-4 h-4" />
                {showQR ? 'Hide' : 'Pair'}
              </button>
            </div>
            
            <AnimatePresence>
              {showQR && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-6 mt-4 border-t border-black/10 dark:border-white/10 flex flex-col items-center justify-center">
                    <div className="w-32 h-32 bg-white p-2 rounded-xl mb-4 shadow-sm border border-black/5">
                      {/* Placeholder for actual QR code */}
                      <div className="w-full h-full border-4 border-black border-dashed flex items-center justify-center opacity-30">QR</div>
                    </div>
                    <p className="text-xs text-center opacity-60 max-w-[200px]">
                      Scan this QR with the Glide Android App to securely link SMS forwarding to this local IP.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Danger Zone */}
          <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-6 md:p-8">
            <h3 className="text-red-500 font-bold mb-4">Data & Privacy</h3>
            <div className="flex flex-col gap-3">
              <button className="w-full px-4 py-3 bg-white/50 dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-black/5 transition-colors">
                <Download className="w-4 h-4" /> Export Financial State (JSON)
              </button>
              <button className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
                <Trash2 className="w-4 h-4" /> Wipe Local Database
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
