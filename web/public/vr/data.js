/**
 * Glide VR — identity and ledger.
 *
 * The headset is a second screen onto the phone's work, never a second source
 * of truth. The phone reads the inbox, parses it on-device and mirrors a
 * summary to Firestore; the headset signs in as the same person and reads that
 * summary back. No message bodies exist in the cloud, so none can reach here.
 */

import { FIREBASE } from './config.js';

const IDP = 'https://identitytoolkit.googleapis.com/v1';
const FS = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
const STORE = 'glide_vr_session';

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
  if (s) localStorage.setItem(STORE, JSON.stringify(s));
  else localStorage.removeItem(STORE);
}

export function currentUser() {
  return session ? { uid: session.uid, email: session.email } : null;
}

export function signOut() {
  persist(null);
}

async function idp(path, body) {
  const res = await fetch(`${IDP}/${path}?key=${FIREBASE.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!res.ok) {
    // Firebase error codes are shouty constants; make them human.
    const code = json?.error?.message || 'SIGN_IN_FAILED';
    throw new Error(
      {
        EMAIL_NOT_FOUND: 'No account with that email.',
        INVALID_PASSWORD: 'Wrong password.',
        INVALID_LOGIN_CREDENTIALS: 'Email or password is wrong.',
        EMAIL_EXISTS: 'That email is already registered.',
        WEAK_PASSWORD: 'Password must be at least 6 characters.',
        TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Try again shortly.',
      }[code] || code.replace(/_/g, ' ').toLowerCase()
    );
  }
  return json;
}

export async function signIn(email, password) {
  const r = await idp('accounts:signInWithPassword', { email, password });
  persist({
    uid: r.localId,
    email: r.email,
    idToken: r.idToken,
    refreshToken: r.refreshToken,
    expiresAt: Date.now() + Number(r.expiresIn || 3600) * 1000,
  });
  return currentUser();
}

export async function signUp(email, password) {
  const r = await idp('accounts:signUp', { email, password });
  persist({
    uid: r.localId,
    email: r.email,
    idToken: r.idToken,
    refreshToken: r.refreshToken,
    expiresAt: Date.now() + Number(r.expiresIn || 3600) * 1000,
  });
  return currentUser();
}

/** Tokens last an hour; refresh a minute early rather than fail a read. */
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
    throw new Error('Session expired. Sign in again.');
  }
  const r = await res.json();
  persist({
    ...session,
    idToken: r.id_token,
    refreshToken: r.refresh_token,
    expiresAt: Date.now() + Number(r.expires_in || 3600) * 1000,
  });
  return session.idToken;
}

// ---------------------------------------------------------------------------
// Firestore REST returns values wrapped in type tags. Unwrap to plain JS.
// ---------------------------------------------------------------------------

function decode(value) {
  if (value == null) return null;
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return Date.parse(value.timestampValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}

/** The shape the rest of the VR app reads, with every field defaulted. */
function shape(summary) {
  const s = summary || {};
  const net = Number(s.net) || 0;
  const floor = Number(s.bufferFloor) || 0;
  return {
    windowDays: Number(s.windowDays) || 30,
    messagesScanned: Number(s.messagesScanned) || 0,
    parsed: Number(s.parsed) || 0,
    rejected: Number(s.rejected) || 0,
    totalIn: Number(s.totalIn) || 0,
    totalOut: Number(s.totalOut) || 0,
    net,
    discretionary: Number(s.discretionary) || 0,
    essential: Number(s.essential) || 0,
    dailyRunRate: Number(s.dailyRunRate) || 0,
    averageConfidence: Number(s.averageConfidence) || 0,
    bufferFloor: floor,
    // Identical to the phone: max(net - floor, 0). Two devices must never
    // disagree about the one number the whole app exists to produce.
    safeToSpend: Math.max(net - floor, 0),
    income: {
      p10: Number(s.incomeP10) || 0,
      p50: Number(s.incomeP50) || 0,
      p90: Number(s.incomeP90) || 0,
      basis: s.incomeBasis || 'no basis recorded',
    },
    categories: (s.categories || []).map((c) => ({
      category: c.category || 'Unknown',
      amount: Number(c.amount) || 0,
      count: Number(c.count) || 0,
      share: Number(c.share) || 0,
      essential: !!c.essential,
    })),
    obligations: (s.obligations || []).map((o) => ({
      name: o.name || 'Unknown',
      category: o.category || '',
      expectedAmount: Number(o.expectedAmount) || 0,
      cadenceDays: Number(o.cadenceDays) || 0,
      occurrences: Number(o.occurrences) || 0,
      confidence: Number(o.confidence) || 0,
      nextDue: Number(o.nextDue) || 0,
    })),
    updatedAt: Number(s.updatedAt) || 0,
    empty: !summary,
  };
}

export async function fetchLedger() {
  const token = await freshToken();
  const res = await fetch(`${FS}/users/${session.uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // A brand-new account has no document yet. That is not an error, it is a
  // person who has not opened the phone app since signing up.
  if (res.status === 404) return shape(null);
  if (!res.ok) throw new Error(`Could not read your ledger (${res.status})`);

  const json = await res.json();
  return shape(decodeFields(json.fields || {}).summary);
}
