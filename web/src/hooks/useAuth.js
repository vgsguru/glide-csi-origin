import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../api/client';
import { cloudSignIn, cloudSignUp, cloudSignOut, cloudUser } from '../api/cloud';

const STORAGE_USER = 'glide_auth_user';

function loadUser() {
  try {
    const raw = localStorage.getItem(STORAGE_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist(user) {
  if (user) localStorage.setItem(STORAGE_USER, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_USER);
}

/**
 * Auth against the Glide backend. The session token is a signed bearer token;
 * the cached user object is only a render hint -- /auth/me is the source of truth.
 */
export function useAuth() {
  const [user, setUser] = useState(() => loadUser());
  const [loading, setLoading] = useState(true);

  // Revalidate a cached session on boot.
  useEffect(() => {
    let cancelled = false;
    async function revalidate() {
      // Firebase is the identity of record. A cloud session is enough to be
      // signed in; the backend token, when present, only unlocks the agent view.
      const cloud = cloudUser();
      if (!getToken()) {
        if (!cancelled) {
          const session = cloud ? { ...cloud, isNew: false, onboarded: true } : null;
          setUser(session);
          persist(session);
          setLoading(false);
        }
        return;
      }
      try {
        const { user: fresh } = await api.me();
        if (!cancelled) {
          const session = { ...fresh, isNew: !fresh.onboarded };
          setUser(session);
          persist(session);
        }
      } catch {
        if (!cancelled) {
          setToken(null);
          const session = cloud ? { ...cloud, isNew: false, onboarded: true } : null;
          setUser(session);
          persist(session);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    revalidate();
    return () => { cancelled = true; };
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    const cloud = await cloudSignUp(email, password, name);
    try {
      const result = await api.signup(email, password, name);
      setToken(result.token);
    } catch {
      // No backend reachable. Expected in a deployed build.
    }
    const session = { ...cloud, isNew: true, onboarded: false };
    setUser(session);
    persist(session);
    return session;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const cloud = await cloudSignIn(email, password);
    try {
      const result = await api.login(email, password);
      setToken(result.token);
    } catch {
      // No backend reachable. The cloud ledger is the one that matters.
    }
    const session = { ...cloud, isNew: false, onboarded: true };
    setUser(session);
    persist(session);
    return session;
  }, []);

  const signOut = useCallback(() => {
    cloudSignOut();
    setToken(null);
    setUser(null);
    persist(null);
  }, []);

  const markOnboarded = useCallback(async () => {
    try {
      const { user: fresh } = await api.updateProfile({ onboarded: true });
      const session = { ...fresh, isNew: false };
      setUser(session);
      persist(session);
    } catch {
      setUser((prev) => {
        const next = prev ? { ...prev, isNew: false, onboarded: true } : prev;
        persist(next);
        return next;
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      if (!getToken()) return cloudUser();
      const { user: fresh } = await api.me();
      const session = { ...fresh, isNew: !fresh.onboarded };
      setUser(session);
      persist(session);
      return session;
    } catch {
      return null;
    }
  }, []);

  return { user, loading, signIn, signUp, signOut, markOnboarded, refresh };
}
