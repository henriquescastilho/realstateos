"use client";

/**
 * Client-side auth store.
 * Tokens are stored in localStorage (with "remember me") or sessionStorage.
 * A module-level store + useSyncExternalStore keeps all consumers in sync.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  org_id: string;
  org_name: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** List of orgs the user belongs to (for org switcher) */
  orgs: Array<{ id: string; name: string }>;
}

// ---------------------------------------------------------------------------
// Module-level store
// ---------------------------------------------------------------------------

type Listener = () => void;

let _state: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  orgs: [],
};
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach((l) => l());
}

export function getSnapshot(): AuthState {
  return _state;
}

export function subscribe(listener: Listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "realstateos_auth";

function persist(state: AuthState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage blocked in some environments
  }
}

function clearPersisted() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Load persisted state on startup (called once on module import). */
function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthState;
      if (parsed.accessToken) {
        _state = parsed;
      }
    }
  } catch {
    // ignore
  }
}

hydrate();

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function setAuth(
  user: AuthUser,
  accessToken: string,
  refreshToken: string,
  orgs: Array<{ id: string; name: string }>,
  remember: boolean,
) {
  _state = { user, accessToken, refreshToken, orgs };
  notify();
  if (remember) {
    persist(_state);
  } else {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch {
      // ignore
    }
  }
}

export function clearAuth() {
  _state = { user: null, accessToken: null, refreshToken: null, orgs: [] };
  clearPersisted();
  document.cookie = "ro_auth=; path=/; max-age=0";
  notify();
}

export function updateToken(accessToken: string) {
  _state = { ..._state, accessToken };
  notify();
  // Refresh persisted copy silently
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) persist(_state);
    const sess = sessionStorage.getItem(STORAGE_KEY);
    if (sess) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch {
    // ignore
  }
}

export function switchOrg(orgId: string) {
  const org = _state.orgs.find((o) => o.id === orgId);
  if (!org || !_state.user) return;
  _state = {
    ..._state,
    user: { ..._state.user, org_id: org.id, org_name: org.name },
  };
  notify();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) persist(_state);
  } catch {
    // ignore
  }
}

export function isAuthenticated(): boolean {
  return _state.accessToken !== null;
}

// ---------------------------------------------------------------------------
// API helpers — attach token to requests
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  org_name: string;
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  orgs: Array<{ id: string; name: string }>;
}

async function authPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Auth failed (${res.status})`;
    try {
      const d = (await res.json()) as {
        detail?: string;
        error?: { message?: string };
      };
      msg = d.detail ?? d.error?.message ?? msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function login(creds: LoginCredentials): Promise<void> {
  const data = await authPost<AuthResponse>("/auth/login", {
    email: creds.email,
    password: creds.password,
  });
  setAuth(
    data.user,
    data.access_token,
    data.refresh_token,
    data.orgs ?? [],
    creds.remember,
  );
  document.cookie = "ro_auth=1; path=/; max-age=604800; SameSite=Lax";
}

export async function register(data: RegisterData): Promise<void> {
  const resp = await authPost<AuthResponse>("/auth/register", data);
  setAuth(
    resp.user,
    resp.access_token,
    resp.refresh_token,
    resp.orgs ?? [],
    true,
  );
  document.cookie = "ro_auth=1; path=/; max-age=604800; SameSite=Lax";
}

export async function refreshAccessToken(): Promise<boolean> {
  if (!_state.refreshToken) return false;
  try {
    const data = await authPost<{ access_token: string }>("/auth/refresh", {
      refresh_token: _state.refreshToken,
    });
    updateToken(data.access_token);
    return true;
  } catch {
    clearAuth();
    return false;
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authPost("/auth/forgot-password", { email });
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<void> {
  await authPost("/auth/reset-password", { token, password });
}

/** Perform authorized fetch — auto-retries with refresh on 401. */
export async function authFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (_state.accessToken) {
    headers["Authorization"] = `Bearer ${_state.accessToken}`;
  }
  let res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (res.status === 401 && _state.refreshToken) {
    const ok = await refreshAccessToken();
    if (ok && _state.accessToken) {
      headers["Authorization"] = `Bearer ${_state.accessToken}`;
      res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers,
        cache: "no-store",
      });
    }
  }
  return res;
}
