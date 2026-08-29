/**
 * Glide VR — the assistant.
 *
 * Ported from the phone's LocalChatEngine so both devices answer the same
 * question the same way. The order is deliberate:
 *
 *   1. Small talk gets small talk.
 *   2. Money questions get a deterministic answer computed from the ledger.
 *   3. Groq may rephrase that answer -- but only if every figure it writes
 *      survives the numeral guard.
 *   4. If the network is gone, step 2 still shipped. VR stays useful offline.
 *
 * The agent can also drive the room: "show me categories" moves the user's
 * focus, so voice reaches every part of the app, not just the chat panel.
 */

import { GROQ_KEY, GROQ_CHAT_MODEL } from './config.js';
import { rupees } from './theme.js';

const money = (n) => rupees(Math.round(Number(n) || 0));

export const SYSTEM_PROMPT = [
  'You are Glide, a financial copilot for people with variable income in India.',
  'You are warm, brief and natural -- a knowledgeable friend, not a report generator.',
  'The user is wearing a VR headset, so keep answers short enough to listen to.',
  '',
  'HOW TO TALK:',
  "- Greetings and small talk ('hi', 'how are you', 'thanks') get a short, friendly,",
  '  human reply. Do NOT recite balances at someone who just said hello.',
  '- Two or three sentences is usually plenty. No bullet lists, no headings.',
  '- Speak in rupees, plainly. No jargon unless the user used it first.',
  '',
  'ABOUT NUMBERS (these never relax):',
  '1. Every figure you state must appear in the CONTEXT block below.',
  '2. Never invent, interpolate or round into a new number.',
  '3. If the context does not contain the answer, say so plainly.',
  '4. Net is derived from bank alerts on the phone, not a bank-confirmed balance.',
].join('\n');

/** The only facts the model may use. Mirrors the phone's buildContext(). */
export function buildContext(a) {
  const lines = [
    'Currency: INR (write amounts as Rs.X)',
    `Window: last ${a.windowDays} days of SMS read on the user's phone`,
    `Money in: ${money(a.totalIn)}`,
    `Money out: ${money(a.totalOut)}`,
    `Net over the window: ${money(a.net)} (derived from bank alerts, not a bank-confirmed balance)`,
    `Buffer floor (user-set): ${money(a.bufferFloor)}`,
    `Safe to spend (net minus floor): ${money(a.safeToSpend)}`,
    `Daily run-rate: ${money(a.dailyRunRate)} per day`,
    `Discretionary spend: ${money(a.discretionary)}`,
    `Essential spend: ${money(a.essential)}`,
    `Monthly income band: p10 ${money(a.income.p10)} / p50 ${money(a.income.p50)} / p90 ${money(a.income.p90)}`,
    `Income basis: ${a.income.basis}`,
    `Messages scanned: ${a.messagesScanned}, parsed as transactions: ${a.parsed}, rejected: ${a.rejected}`,
  ];

  if (a.categories.length) {
    lines.push('Spending by category:');
    a.categories.slice(0, 6).forEach((c) =>
      lines.push(`  - ${c.category}: ${money(c.amount)} (${Math.round(c.share * 100)}%, ${c.count} transactions)`)
    );
  }

  if (a.obligations.length) {
    lines.push('Recurring payments discovered from repeats (not configured):');
    a.obligations.slice(0, 6).forEach((o) =>
      lines.push(
        `  - ${o.name}: ${money(o.expectedAmount)} every ${o.cadenceDays} days ` +
          `(${Math.round(o.confidence * 100)}% confidence, seen ${o.occurrences} times)`
      )
    );
  } else {
    lines.push('Recurring payments: none discovered yet');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Numeral guard
// ---------------------------------------------------------------------------

function numerals(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const v = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(v)) out.add(Math.round(v));
  }
  return out;
}

/**
 * Any figure above 100 that the model wrote but the context never contained is
 * a hallucination, and the whole rewrite is discarded. Small numbers pass
 * because "two or three categories" is prose, not a financial claim.
 */
export function numeralsAreGrounded(generated, context) {
  const allowed = numerals(context);
  for (const v of numerals(generated)) {
    if (allowed.has(v)) continue;
    if (v <= 100) continue;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Small talk
// ---------------------------------------------------------------------------

const GREETINGS = [
  'hi', 'hii', 'hey', 'hello', 'yo', 'hai', 'namaste', 'good morning',
  'good afternoon', 'good evening', 'how are you', 'how r u', "what's up",
  'whats up', 'sup', 'how you doing',
];

function smallTalk(q) {
  const low = q.toLowerCase().trim().replace(/[!.?,]+$/, '');
  if (low.length > 40) return null;

  const isGreeting = GREETINGS.some((g) => low === g || low.startsWith(g + ' ') || low.endsWith(' ' + g));

  if (low.includes('how are you') || low.includes('how r u') || low.includes('how you doing'))
    return 'Doing well, thanks. I have your numbers up here whenever you want them.';
  if (isGreeting) return 'Hey. What would you like to know about your money?';
  if (/^(thanks|thank you|thx|ty|cheers)/.test(low)) return 'Anytime.';
  if (/^(bye|goodbye|good night|see you)/.test(low)) return 'Talk soon.';
  if (low.includes('who are you') || low.includes('what can you do'))
    return 'I am Glide. Your phone reads your bank messages and I answer from those numbers — spending, income, and what is safe to spend.';
  return null;
}

// ---------------------------------------------------------------------------
// Commands — this is what gives voice access to the whole app
// ---------------------------------------------------------------------------

function command(q) {
  const low = q.toLowerCase();
  const wants = (...w) => w.some((x) => low.includes(x));

  if (wants('sign out', 'log out', 'logout')) return { action: 'signOut', text: 'Signing you out.' };
  if (wants('refresh', 'reload', 'sync', 'update the data', 'latest'))
    return { action: 'refresh', text: 'Pulling the latest from your phone.' };
  if (wants('category', 'categories', 'breakdown', 'where did my money go', 'spending by'))
    return { action: 'focus:categories', text: null };
  if (wants('recurring', 'obligation', 'bills', 'subscriptions', 'due'))
    return { action: 'focus:obligations', text: null };
  if (wants('income', 'earn', 'salary'))
    return { action: 'focus:income', text: null };
  if (wants('dashboard', 'overview', 'go back', 'home', 'main'))
    return { action: 'focus:overview', text: 'Here is the overview.' };
  return null;
}

// ---------------------------------------------------------------------------
// Deterministic answers
// ---------------------------------------------------------------------------

function ruleAnswer(q, a) {
  const low = q.toLowerCase();
  const wants = (...w) => w.some((x) => low.includes(x));

  if (a.empty)
    return 'I cannot see any data yet. Open Glide on your phone and let it read your messages, then ask me again.';

  if (wants('safe to spend', 'safe spend', 'can i spend', 'how much can i'))
    return (
      `You have ${money(a.safeToSpend)} safe to spend — that is ${money(a.net)} net over the last ` +
      `${a.windowDays} days, above your ${money(a.bufferFloor)} floor.`
    );

  if (wants('how much did i spend', 'total spend', 'money out', 'spent'))
    return (
      `${money(a.totalOut)} went out over the last ${a.windowDays} days — ` +
      `${money(a.essential)} essential, ${money(a.discretionary)} discretionary.`
    );

  if (wants('how much did i earn', 'money in', 'income', 'earn'))
    return (
      `${money(a.totalIn)} came in over the last ${a.windowDays} days. Your monthly income band ` +
      `runs ${money(a.income.p10)} to ${money(a.income.p90)}, with a middle of ${money(a.income.p50)}.`
    );

  if (wants('category', 'categories', 'where did my money', 'breakdown')) {
    if (!a.categories.length) return 'I have no categorised spending yet.';
    const top = a.categories.slice(0, 3).map((c) => `${c.category} ${money(c.amount)}`).join(', ');
    return `Your biggest categories are ${top}.`;
  }

  if (wants('recurring', 'obligation', 'bills', 'subscription', 'due')) {
    if (!a.obligations.length) return 'I have not spotted any recurring payments yet.';
    const top = a.obligations.slice(0, 3).map((o) => `${o.name} ${money(o.expectedAmount)}`).join(', ');
    return `I found ${a.obligations.length} recurring payments — ${top}.`;
  }

  if (wants('run rate', 'per day', 'daily', 'burn'))
    return `You are running at ${money(a.dailyRunRate)} a day over the last ${a.windowDays} days.`;

  if (wants('net', 'balance', 'left', 'remaining'))
    return (
      `Net over the last ${a.windowDays} days is ${money(a.net)}. That comes from bank alerts on ` +
      `your phone, not a confirmed bank balance.`
    );

  return null;
}

/** Everything the assistant knows how to say when nothing else matched. */
function fallback(a) {
  if (a.empty) return 'I cannot see any data yet. Open Glide on your phone first.';
  return (
    `You have ${money(a.safeToSpend)} safe to spend, and you are running at ` +
    `${money(a.dailyRunRate)} a day. Ask me about spending, income or recurring payments.`
  );
}

// ---------------------------------------------------------------------------
// Groq rewrite
// ---------------------------------------------------------------------------

async function groqChat(question, context, priorAnswer, history) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `CONTEXT (the only facts you may use):\n${context}` },
  ];
  history.slice(-6).forEach((m) => messages.push({ role: m.role, content: m.content }));
  if (priorAnswer)
    messages.push({
      role: 'system',
      content: `A correct answer computed from the data is: "${priorAnswer}". Say this naturally, keeping every figure exactly as written.`,
    });
  messages.push({ role: 'user', content: question });

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: GROQ_CHAT_MODEL, messages, temperature: 0.6, max_tokens: 220 }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const json = await res.json();
  return (json.choices?.[0]?.message?.content || '').trim();
}

/**
 * Answer a question. Returns { text, action, engine }.
 * `action` is consumed by the scene to move the user's focus.
 */
export async function answer(question, ledger, history = []) {
  const cmd = command(question);
  const chat = smallTalk(question);
  const rule = ruleAnswer(question, ledger);

  // A pure navigation command with nothing to report is answered by the rule
  // engine for the destination, so "show me categories" both moves and speaks.
  let base = chat || (cmd && cmd.text) || rule || fallback(ledger);
  const action = cmd ? cmd.action : null;

  // Small talk and commands are already conversational; do not spend a round
  // trip making them "better".
  if (chat || (cmd && cmd.text)) return { text: base, action, engine: 'on-device' };

  const context = buildContext(ledger);
  try {
    const generated = await groqChat(question, context, base, history);
    if (generated && numeralsAreGrounded(generated, context + '\n' + base))
      return { text: generated, action, engine: GROQ_CHAT_MODEL.split('/').pop() };
  } catch {
    // Network gone, key rejected, model down -- the deterministic answer stands.
  }
  return { text: base, action, engine: 'on-device' };
}
