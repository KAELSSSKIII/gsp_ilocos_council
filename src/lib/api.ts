/**
 * api.ts — Thin fetch wrapper for the Express API.
 *
 * Relies on an HttpOnly session cookie issued by the Express API.
 * Client requests include credentials so the browser sends that cookie
 * without exposing the session token to JavaScript.
 */

import { useSessionStore } from "@/store/sessionStore";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

type RequestOptions = RequestInit & {
  redirectOnUnauthorized?: boolean;
};

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { redirectOnUnauthorized = true, ...requestOptions } = options;
  const res = await fetch(`${BASE}${path}`, {
    ...requestOptions,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(requestOptions.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      useSessionStore.getState().reset();
      if (redirectOnUnauthorized) {
        window.location.href = "/login";
      }
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
    return request<{ profile: Record<string, unknown> }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      redirectOnUnauthorized: false,
    });
  },

  async me() {
    return api.get<{ profile: Record<string, unknown> }>("/auth/me");
  },

  async logout() {
    await api.post("/auth/logout", {}).catch(() => {});
  },
};

export default api;
