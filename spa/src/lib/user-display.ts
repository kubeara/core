import type { User } from "./types";

export function getDisplayName(
  user: Pick<User, "firstName" | "lastName" | "name">,
): string {
  const full = `${user.firstName} ${user.lastName}`.trim();
  return full || user.name;
}

export function getUserInitials(
  user: Pick<User, "firstName" | "lastName" | "name">,
): string {
  const first = user.firstName.trim().charAt(0);
  const last = user.lastName.trim().charAt(0);
  if (first && last) return `${first}${last}`.toUpperCase();
  if (first) return first.toUpperCase();
  return user.name.charAt(0).toUpperCase() || "?";
}
