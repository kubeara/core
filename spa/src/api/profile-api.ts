import { apiFetch } from "@/lib/api-client";
import { assertOk } from "@/lib/api-error";
import type { User } from "@/lib/types";

export type UpdateGeneralProfileInput = {
  firstName: string;
  lastName: string;
  profilePicture?: string | null;
};

export async function updateGeneralProfile(
  input: UpdateGeneralProfileInput,
): Promise<User> {
  const res = await apiFetch("/api/profile/general", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  await assertOk(res);
  const data = (await res.json()) as { user: User };
  return data.user;
}

export async function changeProfilePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const res = await apiFetch("/api/profile/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
  await assertOk(res);
  return res.json() as Promise<{ message: string }>;
}

export async function updateOrganizationProfile(input: {
  orgName: string;
  orgLogo?: string | null;
}): Promise<User> {
  const res = await apiFetch("/api/profile/organization", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  await assertOk(res);
  const data = (await res.json()) as { user: User };
  return data.user;
}
