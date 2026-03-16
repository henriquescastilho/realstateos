import { getSnapshot } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const NODE_API_URL =
  process.env.NEXT_PUBLIC_NODE_API_URL ?? "http://localhost:3001/api/v1";

// In-memory token store (for MVP — replace with cookie/session in production)
let _accessToken: string | null = null;

export function setAccessToken(token: string) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function clearAccessToken() {
  _accessToken = null;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    const clone = response.clone();

    try {
      const data = (await response.json()) as { detail?: string };
      if (typeof data.detail === "string") {
        message = data.detail;
      }
    } catch {
      const text = await clone.text();
      if (text) {
        message = text;
      }
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  // Use token from auth store (login flow), fallback to legacy module-level token
  const token = getSnapshot().accessToken ?? _accessToken;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function normalizePath(path: string): string {
  // Strip /v1 prefix since NODE_API_URL already includes /api/v1
  return path.replace(/^\/v1/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = normalizePath(path);
  const response = await fetch(`${API_URL}${normalizedPath}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...authHeaders(),
      ...init?.headers,
    },
  });
  const json = await parseResponse<Record<string, unknown>>(response);
  // Node API wraps responses in { ok, data } — unwrap it
  if (json && typeof json === "object" && "data" in json) {
    return json.data as T;
  }
  return json as unknown as T;
}

async function nodeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${NODE_API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...authHeaders(),
      ...init?.headers,
    },
  });
  const json = await parseResponse<Record<string, unknown>>(response);
  // Node API wraps responses in { ok, data } — unwrap it
  if (json && typeof json === "object" && "data" in json) {
    return json.data as T;
  }
  return json as unknown as T;
}

export function apiGet<T>(path: string) {
  return request<T>(path);
}

export function nodeApiGet<T>(path: string) {
  return nodeRequest<T>(path);
}

export function nodeApiPost<T>(path: string, body?: unknown) {
  return nodeRequest<T>(path, {
    method: "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function nodeApiPatch<T>(path: string, body?: unknown) {
  return nodeRequest<T>(path, {
    method: "PATCH",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function nodeApiDelete<T>(path: string) {
  return nodeRequest<T>(path, { method: "DELETE" });
}

export function apiPost<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiUpload<T>(path: string, formData: FormData) {
  return request<T>(path, {
    method: "POST",
    body: formData,
  });
}

export async function login(tenantId: string, email: string): Promise<string> {
  const data = await apiPost<{ access_token: string }>("/auth/token", {
    tenant_id: tenantId,
    email,
  });
  setAccessToken(data.access_token);
  return data.access_token;
}
