import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, Send, Trash2 } from 'lucide-react';
import clsx from 'clsx';

import { api } from '../api/client';
import Logo from '../components/Logo';

export default function Chat({ theme = 'dark' }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [engine, setEngine] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [history, chips] = await Promise.all([api.chatHistory(), api.chatSuggestions()]);
        setMessages(history.messages);
        setSuggestions(chips.suggestions);
        setEngine(chips.engine);
      } catch (err) {
        setError(err);
      }
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text) {
    const question = (text ?? input).trim();
    if (!question || busy) return;

    setInput('');
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: 'user', content: question },
    ]);
    setBusy(true);

    try {
      const { reply } = await api.chat(question);
      setMessages((prev) => [...prev, reply]);
      const chips = await api.chatSuggestions();
      setSuggestions(chips.suggestions);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await api.clearChat();
    setMessages([]);
  }

  const modelReady = engine?.available;

  return (
    <div className="relative flex h-[calc(100vh-5rem)] w-full flex-col">
      {/* Top fade */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-20 bg-gradient-to-b from-[var(--background)] to-transparent" />

      {/* Status strip */}
      <div className="absolute right-4 top-3 z-20 flex items-center gap-2">
        {messages.length > 0 && (
          <button
            onClick={clear}
            title="Clear conversation"
            className="rounded-full bg-[var(--secondary)] p-2 text-[var(--muted-foreground)] hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--secondary)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          <span className={clsx('h-1.5 w-1.5 rounded-full', modelReady ? 'bg-green-500' : 'bg-amber-500')} />
          {modelReady ? engine.model : 'rule engine'}
        </span>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-40 pt-20 md:px-12">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Logo theme={theme} size={44} />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Ask about your money</h2>
              <p className="mt-1 max-w-md text-sm text-[var(--muted-foreground)]">
                Every answer is computed from your live financial state and shows the
                figures it used. Nothing here is invented.
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              'flex w-full max-w-2xl flex-col',
              message.role === 'user' ? 'self-end items-end' : 'self-start items-start',
            )}
          >
            <div className="mb-1.5 flex items-center gap-1.5 px-1">
              {message.role === 'assistant' && <Logo theme={theme} size={12} />}
              <span className="text-xs font-medium text-[var(--muted-foreground)]">
                {message.role === 'assistant' ? 'Glide' : 'You'}
              </span>
            </div>

            <div
              className={clsx(
                'rounded-3xl px-5 py-3.5 text-sm leading-relaxed',
                message.role === 'user'
                  ? 'rounded-tr-md bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'glass rounded-tl-md',
              )}
            >
              {message.content}
            </div>

            {/* Grounding — the numbers behind the answer */}
            {message.role === 'assistant' && message.grounding?.length > 0 && (
              <div className="glass mt-2 w-full max-w-md rounded-2xl p-3.5">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Based on
                </div>
                <div className="space-y-1">
                  {message.grounding.map((row, index) => (
                    <div key={index} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-[var(--muted-foreground)]">{row.label}</span>
                      <span className="flex-1 border-b border-dotted border-[var(--border)]" />
                      <span className="font-semibold">{row.value}</span>
                    </div>
                  ))}
                </div>
                {message.cited_snapshot_ref && (
                  <div className="mt-2 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted-foreground)]">
                    Snapshot {message.cited_snapshot_ref} · {message.engine}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        ))}

        {busy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass self-start rounded-3xl rounded-tl-md px-4 py-3">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--muted-foreground)]"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
              <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                reasoning over your state…
              </span>
            </div>
          </motion.div>
        )}

        {error && (
          <div className="self-center rounded-2xl bg-red-500/10 px-4 py-2 text-xs text-red-500">
            {String(error.message)}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/85 to-transparent p-4">
        <div className="mx-auto max-w-3xl">
          {suggestions.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestions.map((chip) => (
                <button
                  key={chip}
                  onClick={() => send(chip)}
                  disabled={busy}
                  className="glass rounded-full px-3.5 py-1.5 text-xs font-medium disabled:opacity-40"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Can I afford this? Why did my buffer move?"
              className="glass w-full rounded-full py-4 pl-6 pr-24 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none"
            />
            <div className="absolute right-2 flex items-center gap-1">
              <button
                title="Voice input is planned for the ElevenLabs layer"
                className="p-2 text-[var(--muted-foreground)] opacity-40"
                disabled
              >
                <Logo theme={theme} size={20} />
              </button>
              <button
                onClick={() => send()}
                disabled={!input.trim() || busy}
                className="rounded-full bg-[var(--primary)] p-2.5 text-[var(--primary-foreground)] transition disabled:opacity-30"
              >
                <Send className="ml-0.5 h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
