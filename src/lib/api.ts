/**
 * api.ts — Thin fetch wrapper for the Express API.
 *
 * Relies on an HttpOnly session cookie issued by the Express API.
 * Client requests include credentials so the browser sends that cookie
 * without exposing the session token to JavaScript.
 */

import { useSessionStore } from "@/store/sessionStore";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      useSessionStore.getState().reset();
      window.location.href = "/login";
      return undefined as T;
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const message = body?.detail ?? body?.error ?? "Request failed";
    throw Object.assign(new Error(message), {
      status: res.status,
      body,
    });
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const api = {
  get<T = unknown>(path: string): Promise<T> {
    return request<T>(path);
  },

  post<T = unknown>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  patch<T = unknown>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  put<T = unknown>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  delete<T = unknown>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};

export const authApi = {
  async login(username: string, password: string) {
    return api.post<{ profile: Record<string, unknown> }>("/auth/login", { username, password });
  },

  async me() {
    return api.get<{ profile: Record<string, unknown> }>("/auth/me");
  },

  async logout() {
    await api.post("/auth/logout", {}).catch(() => {});
  },
};

export default api;
