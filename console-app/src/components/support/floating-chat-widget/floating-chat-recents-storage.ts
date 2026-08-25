import { generateUuid } from "../../../lib/uuid";

export type FloatingChatRecent = {
  id: string;
  name: string;
  email: string;
  message: string;
  submittedAt: string;
};

const STORAGE_KEY = "kubeara-floating-chat-recents";
const MAX_ITEMS = 30;

function readRaw(): FloatingChatRecent[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFloatingChatRecent);
  } catch {
    return [];
  }
}

/**
 * 
 * @param value - The value to check.
 * @returns True if the value is a valid floating chat recent.
 */
function isFloatingChatRecent(value: unknown): value is FloatingChatRecent {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.email === "string" &&
    typeof item.message === "string" &&
    typeof item.submittedAt === "string"
  );
}

/** Appends a new recent message to the storage. */
export function appendFloatingChatRecent(
  entry: Pick<FloatingChatRecent, "name" | "email" | "message">,
): FloatingChatRecent[] {
  const nextItem: FloatingChatRecent = {
    id: generateUuid(),
    ...entry,
    submittedAt: new Date().toISOString(),
  };

  const merged = [nextItem, ...readRaw()].slice(0, MAX_ITEMS);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore quota / private mode
  }

  return merged.sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
}

export function loadFloatingChatRecents(): FloatingChatRecent[] {
  return readRaw().sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
}
