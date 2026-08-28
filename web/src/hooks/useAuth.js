import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../api/client';

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
      if (!getToken()) {
        if (!cancelled) {
          setUser(null);
          persist(null);
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
          setUser(null);
          persist(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    revalidate();
    return () => { cancelled = true; };
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    const result = await api.signup(email, password, name);
    setToken(result.token);
    const session = { ...result.user, isNew: true };
    setUser(session);
    persist(session);
    return session;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const result = await api.login(email, password);
    setToken(result.token);
    const session = { ...result.user, isNew: result.is_new };
    setUser(session);
    persist(session);
    return session;
  }, []);

  const signOut = useCallback(() => {
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
