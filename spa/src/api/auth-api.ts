import { apiFetch } from "@/lib/api-client";
import { assertOk } from "@/lib/api-error";
import type { User } from "@/lib/types";

export async function fetchCurrentUser(): Promise<User | null> {
  const res = await apiFetch("/api/auth/me");
  if (res.status === 401) return null;
  await assertOk(res);
  const data = (await res.json()) as { user: User };
  return data.user;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<User> {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  await assertOk(res);
  const data = (await res.json()) as { user: User };
  return data.user;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const res = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  await assertOk(res);
  const data = (await res.json()) as { user: User };
  return data.user;
}

export async function logout(): Promise<void> {
  const res = await apiFetch("/api/auth/logout", { method: "POST" });
  await assertOk(res);
}

export type ForgotPasswordResult = {
  message: string;
  resetLink?: string;
};

export async function forgotPassword(email: string): Promise<ForgotPasswordResult> {
  const res = await apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  await assertOk(res);
  return res.json() as Promise<ForgotPasswordResult>;
}

export async function resetPassword(input: {
  token: string;
  password: string;
}): Promise<{ message: string }> {
  const res = await apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
  await assertOk(res);
  return res.json() as Promise<{ message: string }>;
}
