import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { DEV_TEST_USER } from "./dev-test-user";

type StoredUser = {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  profilePicture: string | null;
  orgName: string;
  orgLogo: string | null;
  passwordHash: string;
};

const users = new Map<string, StoredUser>();
const resetTokens = new Map<string, { email: string; expiresAt: number }>();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
   const derivedKey = scryptSync(password, salt, 64).toString("hex");
   return `scrypt$${salt}$${derivedKey}`;
  // return createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, storedDerivedKey] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !storedDerivedKey) return false;
  const derivedKey = scryptSync(password, salt, 64);
  const storedKeyBuffer = Buffer.from(storedDerivedKey, "hex");
  if (derivedKey.length !== storedKeyBuffer.length) return false;
  return timingSafeEqual(derivedKey, storedKeyBuffer);
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function syncDisplayName(user: StoredUser): void {
  user.name = `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function ensureProfileFields(user: StoredUser): StoredUser {
  if (!user.firstName && !user.lastName && user.name) {
    const split = splitName(user.name);
    user.firstName = split.firstName;
    user.lastName = split.lastName;
  }
  if (user.orgName === undefined) user.orgName = "";
  if (user.profilePicture === undefined) user.profilePicture = null;
  if (user.orgLogo === undefined) user.orgLogo = null;
  syncDisplayName(user);
  return user;
}

export function registerUser(
  email: string,
  password: string,
  name: string,
): { ok: true; user: StoredUser } | { ok: false; error: string } {
  const normalized = email.toLowerCase().trim();
  if (users.has(normalized)) {
    return { ok: false, error: "An account with this email already exists." };
  }
  const { firstName, lastName } = splitName(name);
  const user: StoredUser = {
    id: randomBytes(8).toString("hex"),
    email: normalized,
    name: name.trim(),
    firstName,
    lastName,
    profilePicture: null,
    orgName: "",
    orgLogo: null,
    passwordHash: hashPassword(password),
  };
  syncDisplayName(user);
  users.set(normalized, user);
  return { ok: true, user };
}

export function validateUser(
  email: string,
  password: string,
): StoredUser | null {
  const user = users.get(email.toLowerCase().trim());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return ensureProfileFields(user);
}

export function getUserByEmail(email: string): StoredUser | undefined {
  const user = users.get(email.toLowerCase().trim());
  return user ? ensureProfileFields(user) : undefined;
}

export function createResetToken(email: string): string | null {
  const normalized = email.toLowerCase().trim();
  if (!users.has(normalized)) return null;
  const token = randomBytes(24).toString("hex");
  resetTokens.set(token, {
    email: normalized,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return token;
}

export function consumeResetToken(
  token: string,
): { email: string } | null {
  const entry = resetTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    resetTokens.delete(token);
    return null;
  }
  resetTokens.delete(token);
  return { email: entry.email };
}

export function updatePassword(email: string, password: string): boolean {
  const user = users.get(email.toLowerCase().trim());
  if (!user) return false;
  user.passwordHash = hashPassword(password);
  return true;
}

export function changePasswordWithCurrent(
  email: string,
  currentPassword: string,
  newPassword: string,
): { ok: true } | { ok: false; error: string } {
  const user = users.get(email.toLowerCase().trim());
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  user.passwordHash = hashPassword(newPassword);
  return { ok: true };
}

export function updateUserProfile(
  email: string,
  data: {
    firstName: string;
    lastName: string;
    profilePicture?: string | null;
  },
): StoredUser | null {
  const user = users.get(email.toLowerCase().trim());
  if (!user) return null;

  user.firstName = data.firstName.trim();
  user.lastName = data.lastName.trim();
  if (data.profilePicture !== undefined) {
    user.profilePicture = data.profilePicture;
  }
  syncDisplayName(user);
  return user;
}

export function updateOrganization(
  email: string,
  data: { orgName: string; orgLogo?: string | null },
): StoredUser | null {
  const user = users.get(email.toLowerCase().trim());
  if (!user) return null;

  user.orgName = data.orgName.trim();
  if (data.orgLogo !== undefined) {
    user.orgLogo = data.orgLogo;
  }
  return user;
}

export function toPublicUser(user: StoredUser) {
  const normalized = ensureProfileFields(user);
  return {
    id: normalized.id,
    email: normalized.email,
    name: normalized.name,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    profilePicture: normalized.profilePicture,
    organization: {
      name: normalized.orgName,
      logo: normalized.orgLogo,
    },
  };
}

function seedDevTestUser() {
  if (process.env.NODE_ENV === "production") return;

  const { email, password, name } = DEV_TEST_USER;
  if (users.has(email)) return;

  const { firstName, lastName } = splitName(name);
  users.set(email, {
    id: "dev-test-user",
    email,
    name,
    firstName,
    lastName,
    profilePicture: null,
    orgName: "Kubeara Labs",
    orgLogo: null,
    passwordHash: hashPassword(password),
  });
}

seedDevTestUser();
