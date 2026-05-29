import type { User } from "@/types";

/**
 * Get a display name for a user.
 * Falls back to "User" if name is empty.
 * 
 * @param user - User object with name property
 * @returns Display name string
 * 
 * @example
 * getDisplayName({ name: 'John Doe' }) // => 'John Doe'
 * getDisplayName({ name: '' }) // => 'User'
 */
export function getDisplayName(user: Pick<User, "name">): string {
  return user.name || "User";
}

/**
 * Get user initials from their name.
 * 
 * Rules:
 * - If name has multiple words, use first letter of first and last word
 * - If name has one word, use first letter
 * - If name is empty, use "?"
 * 
 * @param user - User object with name property
 * @returns Uppercase initials (1-2 characters)
 * 
 * @example
 * getUserInitials({ name: 'John Doe' }) // => 'JD'
 * getUserInitials({ name: 'Alice' }) // => 'A'
 * getUserInitials({ name: '' }) // => '?'
 */
export function getUserInitials(user: Pick<User, "name">): string {
  const name = user.name.trim();
  if (!name) return "?";

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}
