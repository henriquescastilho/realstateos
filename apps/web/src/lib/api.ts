const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

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
  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...authHeaders(),
      ...init?.headers,
    },
  });
  return parseResponse<T>(response);
}

export function apiGet<T>(path: string) {
  return request<T>(path);
}

export function apiPost<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
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
