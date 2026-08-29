/**
 * Cloud data path — Firebase Auth + Firestore, no backend required.
 *
 * The Flask backend is a development convenience: it runs on localhost, so a
 * deployed build could never reach it and the hosted app was unusable by
 * anyone but us. The phone already mirrors a summary to Firestore for the
 * headset to read; the web app now reads exactly the same document.
 *
 * Same identity, same figures, same safe-to-spend expression on all three
 * surfaces. The backend stays optional and adds the agent view when present.
 */

const FIREBASE = {
  projectId: 'manage-buddy',
  apiKey: 'AIzaSyD66GMG_wG5BNRX9pO5hcZ6OgusuVa3MhI',
};

const IDP = 'https://identitytoolkit.googleapis.com/v1';
const FS = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
const STORE = 'glide_cloud_session';

let session = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || 'null');
  } catch {
    return null;
  }
}

function persist(s) {
  session = s;
  try {
    if (s) localStorage.setItem(STORE, JSON.stringify(s));
    else localStorage.removeItem(STORE);
  } catch {
    /* private mode — the session simply does not survive a reload */
  }
}

export function cloudUser() {
  return session ? { id: session.uid, email: session.email, name: session.name } : null;
}

export function cloudSignOut() {
  persist(null);
}

const FRIENDLY = {
  EMAIL_NOT_FOUND: 'No account with that email.',
  INVALID_PASSWORD: 'Wrong password.',
  INVALID_LOGIN_CREDENTIALS: 'That email and password do not match.',
  EMAIL_EXISTS: 'That email is already registered. Try signing in.',
  WEAK_PASSWORD: 'Password must be at least 6 characters.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Try again in a minute.',
  INVALID_EMAIL: 'That does not look like an email address.',
};

async function idp(path, body) {
  const res = await fetch(`${IDP}/${path}?key=${FIREBASE.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!res.ok) {
    const code = (json?.error?.message || 'SIGN_IN_FAILED').split(' : ')[0];
    throw new Error(FRIENDLY[code] || code.replace(/_/g, ' ').toLowerCase());
  }
  return json;
}

function adopt(r, name) {
  persist({
    uid: r.localId,
    email: r.email,
    name: name || r.displayName || (r.email || '').split('@')[0],
    idToken: r.idToken,
    refreshToken: r.refreshToken,
    expiresAt: Date.now() + Number(r.expiresIn || 3600) * 1000,
  });
  return cloudUser();
}

export async function cloudSignIn(email, password) {
  return adopt(await idp('accounts:signInWithPassword', { email, password }));
}

export async function cloudSignUp(email, password, name) {
  return adopt(await idp('accounts:signUp', { email, password }), name);
}

/** Tokens last an hour. Refresh a minute early rather than fail a read. */
async function freshToken() {
  if (!session) throw new Error('Not signed in');
  if (Date.now() < session.expiresAt - 60_000) return session.idToken;

  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`,
  });
  if (!res.ok) {
    persist(null);
    throw new Error('Your session expired. Sign in again.');
  }
  const r = await res.json();
  persist({ ...session, idToken: r.id_token, refreshToken: r.refresh_token,
    expiresAt: Date.now() + Number(r.expires_in || 3600) * 1000 });
  return session.idToken;
}

// ---------------------------------------------------------------------------
// Firestore REST wraps every value in a type tag. Unwrap to plain JS.
// ---------------------------------------------------------------------------

function decode(v) {
  if (v == null) return null;
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  return null;
}

function fields(f) {
  const out = {};
  for (const [k, v] of Object.entries(f)) out[k] = decode(v);
  return out;
}

export async function fetchSummary() {
  const token = await freshToken();
  const res = await fetch(`${FS}/users/${session.uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // A new account has no document yet. That is a person who has not opened the
  // phone app, not an error.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read your ledger (${res.status})`);
  const json = await res.json();
  return fields(json.fields || {}).summary || null;
}

// ---------------------------------------------------------------------------
// Adapt the summary into the shape the dashboard already renders.
// ---------------------------------------------------------------------------

/** Thirty days forward at three income levels, against the daily run-rate. */
function project(net, floor, income, runRate) {
  const DAYS = 30;
  const levels = [
    ['pessimistic', income.p10],
    ['expected', income.p50],
    ['optimistic', income.p90],
  ];

  return levels.map(([scenario, monthly]) => {
    const perDay = monthly / 30 - runRate;
    const series = [];
    let breachDay = null;
    for (let day = 0; day <= DAYS; day++) {
      const balance = net + perDay * day;
      series.push({ day, balance });
      if (breachDay === null && balance < floor) breachDay = day;
    }
    return {
      scenario,
      series,
      end_balance: series[series.length - 1].balance,
      breaches_floor: breachDay !== null,
      breach_day: breachDay,
    };
  });
}

function stabilityLabel(p10, p90, p50) {
  if (!p50) return 'not enough history';
  const spread = (p90 - p10) / p50;
  if (spread < 0.35) return 'fairly steady';
  if (spread < 0.9) return 'variable';
  return 'highly variable';
}

export function toDashboardState(summary) {
  const s = summary || {};
  const net = Number(s.net) || 0;
  const floor = Number(s.bufferFloor) || 0;
  const runRate = Number(s.dailyRunRate) || 0;
  const income = {
    p10: Number(s.incomeP10) || 0,
    p50: Number(s.incomeP50) || 0,
    p90: Number(s.incomeP90) || 0,
    basis: s.incomeBasis || 'no basis recorded yet',
    confidence: Number(s.averageConfidence) || 0,
  };
  income.stability = stabilityLabel(income.p10, income.p90, income.p50);

  const obligations = (s.obligations || []).map((o, i) => ({
    id: `ob-${i}`,
    name: o.name || 'Unknown',
    category: o.category || '',
    expected_amount: Number(o.expectedAmount) || 0,
    cadence_days: Number(o.cadenceDays) || 0,
    occurrences: Number(o.occurrences) || 0,
    confidence: Number(o.confidence) || 0,
    days_until: Number(o.nextDue) || 0,
  }));

  // Identical to the phone and the headset: max(net - floor, 0). The web
  // dashboard renders the working, so the components are spelled out too --
  // the device path deliberately does not forward-project inflow or net off
  // obligations, and those read as zero rather than being quietly invented.
  const raw = net - floor;

  return {
    safe_to_spend: {
      amount: Math.max(raw, 0),
      raw,
      is_negative: raw < 0,
      components: {
        balance: net,
        expected_inflow_conservative: 0,
        committed_obligations: 0,
        buffer_floor: floor,
      },
    },
    buffer_floor: floor,
    net,
    transaction_count: Number(s.parsed) || 0,
    messages_scanned: Number(s.messagesScanned) || 0,
    needs_review_count: 0,
    income,
    spend: {
      total: Number(s.totalOut) || 0,
      discretionary: Number(s.discretionary) || 0,
      essential: Number(s.essential) || 0,
      by_category: (s.categories || []).map((c) => ({
        category: c.category || 'Unknown',
        amount: Number(c.amount) || 0,
        count: Number(c.count) || 0,
        share: Number(c.share) || 0,
        essential: !!c.essential,
      })),
    },
    obligations,
    obligations_total: obligations.reduce((t, o) => t + o.expected_amount, 0),
    projection: project(net, floor, income, runRate),
    updated_at: Number(s.updatedAt) || 0,
    source: 'cloud',
    empty: !summary,
  };
}

export async function cloudDashboardState() {
  return toDashboardState(await fetchSummary());
}

// ---------------------------------------------------------------------------
// Grounded chat, without a backend.
//
// Deliberately deterministic rather than generative. The phone and headset
// fall back to exactly this when the network or a key is missing, and the
// contract is the same: every figure comes from the ledger, so there is
// nothing for a model to invent.
// ---------------------------------------------------------------------------

const rupee = (n) =>
  'Rs.' + Math.round(Number(n) || 0).toLocaleString('en-IN');

export async function cloudChat(question) {
  const state = await cloudDashboardState();
  const q = String(question).toLowerCase();
  const wants = (...w) => w.some((x) => q.includes(x));
  const sts = state.safe_to_spend;
  const income = state.income;

  let content;
  let grounding = [];

  if (state.empty) {
    content =
      'I cannot see any data on this account yet. Open Glide on your phone, sign in with the ' +
      'same account, and let it read your messages — this fills in the moment it syncs.';
  } else if (/^(hi|hey|hello|yo|namaste)\b/.test(q) || wants('how are you')) {
    content = 'Hey. What would you like to know about your money?';
  } else if (wants('safe to spend', 'can i spend', 'how much can i', 'afford')) {
    content =
      `You have ${rupee(sts.amount)} safe to spend — that is ${rupee(state.net)} net, ` +
      `above your ${rupee(state.buffer_floor)} floor.`;
    grounding = [
      { label: 'Net over the window', value: rupee(state.net) },
      { label: 'Buffer floor', value: rupee(state.buffer_floor) },
      { label: 'Safe to spend', value: rupee(sts.amount) },
    ];
  } else if (wants('spend', 'spent', 'money out', 'where did')) {
    const top = state.spend.by_category.slice(0, 3)
      .map((c) => `${c.category} ${rupee(c.amount)}`).join(', ');
    content =
      `${rupee(state.spend.total)} went out — ${rupee(state.spend.essential)} essential, ` +
      `${rupee(state.spend.discretionary)} discretionary.` + (top ? ` Biggest: ${top}.` : '');
    grounding = state.spend.by_category.slice(0, 4)
      .map((c) => ({ label: c.category, value: rupee(c.amount) }));
  } else if (wants('income', 'earn', 'salary', 'money in')) {
    content =
      `Your monthly income runs ${rupee(income.p10)} to ${rupee(income.p90)}, with a middle of ` +
      `${rupee(income.p50)}. It is ${income.stability}.`;
    grounding = [
      { label: 'p10', value: rupee(income.p10) },
      { label: 'p50', value: rupee(income.p50) },
      { label: 'p90', value: rupee(income.p90) },
      { label: 'Basis', value: income.basis },
    ];
  } else if (wants('recurring', 'obligation', 'bills', 'subscription', 'due')) {
    if (!state.obligations.length) {
      content = 'I have not spotted any recurring payments yet. They appear as the pattern builds.';
    } else {
      const top = state.obligations.slice(0, 3)
        .map((o) => `${o.name} ${rupee(o.expected_amount)}`).join(', ');
      content = `I found ${state.obligations.length} recurring payments — ${top}.`;
      grounding = state.obligations.slice(0, 4).map((o) => ({
        label: `${o.name} · every ${o.cadence_days}d`,
        value: rupee(o.expected_amount),
      }));
    }
  } else {
    content =
      `You have ${rupee(sts.amount)} safe to spend right now. Ask me about spending, income, ` +
      'or recurring payments.';
    grounding = [{ label: 'Safe to spend', value: rupee(sts.amount) }];
  }

  return {
    reply: { id: `cloud-${Date.now()}`, role: 'assistant', content, grounding },
  };
}

export async function cloudSuggestions() {
  return {
    suggestions: [
      "What's safe to spend?",
      'Where did my money go?',
      'What do I earn in a typical month?',
      'What recurring payments did you find?',
    ],
  };
}
