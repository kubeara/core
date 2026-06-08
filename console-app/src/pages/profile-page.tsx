import { useEffect, useState } from "react";
import {
  useChangeProfilePasswordMutation,
  useUpdateGeneralProfileMutation,
} from "@/features/profile/hooks";
import { useAuth } from "@/features/auth/context/use-auth";
import { BackLink } from "@/components/shared/back-link";
import { ProfilePageSkeleton } from "@/components/shared/skeleton";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PasswordField } from "@/components/shared/password-field";
import { PasswordInput } from "@/components/shared/password-input";
import { FormFieldLabel } from "@/components/shared/form-field-label";
import { validatePassword, validateRequired } from "@/lib/validation";
import "@/components/profile-page.css";

function GeneralDetailsCard() {
  const { user } = useAuth();
  const updateMutation = useUpdateGeneralProfileMutation();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isSaving = updateMutation.isPending;

  useEffect(() => {
    if (!user) return;
    const parts = user.name.split(/\s+/).filter(Boolean);
    setFirstName(parts[0] || "");
    setLastName(parts.slice(1).join(" ") || "");
  }, [user]);

  function clearFieldError(fieldId: string) {
    setFieldErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nextFieldErrors: Record<string, string> = {};
    const firstNameError = validateRequired(firstName, "First name");
    if (firstNameError) nextFieldErrors.firstName = firstNameError;

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});

    try {
      await updateMutation.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
    } catch {
      // Error toast shown by mutation hook
    }
  }

  return (
    <section className="profile-section-card">
      <div className="profile-section-header">
        <div>
          <h2>General details</h2>
          <p className="profile-section-desc">
            Your personal information and appearance preferences.
          </p>
        </div>
        <ThemeToggle variant="switch" />
      </div>
      <form onSubmit={handleSubmit} className="profile-section-form" noValidate>
        <div className="profile-field-group">
          <div className="profile-form-grid">
            <div className="form-field">
              <FormFieldLabel htmlFor="profile-first-name" required>
                First name
              </FormFieldLabel>
              <input
                id="profile-first-name"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  clearFieldError("firstName");
                }}
                autoComplete="given-name"
                disabled={isSaving}
                aria-invalid={fieldErrors.firstName ? true : undefined}
                aria-describedby={
                  fieldErrors.firstName ? "profile-first-name-error" : undefined
                }
              />
              {fieldErrors.firstName && (
                <p
                  id="profile-first-name-error"
                  className="form-field-error"
                  role="alert"
                >
                  {fieldErrors.firstName}
                </p>
              )}
            </div>

            <div className="form-field">
              <FormFieldLabel htmlFor="profile-last-name">
                Last name
              </FormFieldLabel>
              <input
                id="profile-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                disabled={isSaving}
              />
            </div>

            <div className="form-field">
              <FormFieldLabel htmlFor="profile-email">Email</FormFieldLabel>
              <div id="profile-email" className="profile-email-readonly">
                {user.email}
              </div>
            </div>
          </div>
        </div>

        <div className="profile-section-actions">
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ChangePasswordCard() {
  const changeMutation = useChangeProfilePasswordMutation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function clearFieldError(fieldId: string) {
    setFieldErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const nextFieldErrors: Record<string, string> = {};

    const currentPasswordError = validateRequired(
      currentPassword,
      "Current password",
    );
    if (currentPasswordError) {
      nextFieldErrors.currentPassword = currentPasswordError;
    }

    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError) nextFieldErrors.newPassword = newPasswordError;

    const confirmPasswordError = validateRequired(
      confirmPassword,
      "Confirm password",
    );
    if (confirmPasswordError) {
      nextFieldErrors.confirmPassword = confirmPasswordError;
    } else if (newPassword !== confirmPassword) {
      nextFieldErrors.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});

    try {
      await changeMutation.mutateAsync({
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      // Error toast shown by mutation hook
    }
  }

  return (
    <section className="profile-section-card">
      <h2>Change password</h2>
      <p className="profile-section-desc">
        Use a strong password you do not reuse on other sites.
      </p>
      <form onSubmit={handleSubmit} className="profile-section-form" noValidate>
        <div className="profile-form-grid profile-form-grid--narrow">
          <div className="form-field profile-form-grid-span-2">
            <FormFieldLabel htmlFor="current-password" required>
              Current password
            </FormFieldLabel>
            <PasswordInput
              id="current-password"
              name="currentPassword"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                clearFieldError("currentPassword");
              }}
              autoComplete="current-password"
              disabled={changeMutation.isPending}
              placeholder="••••••••"
              aria-invalid={fieldErrors.currentPassword ? true : undefined}
              aria-describedby={
                fieldErrors.currentPassword
                  ? "current-password-error"
                  : undefined
              }
            />
            {fieldErrors.currentPassword && (
              <p
                id="current-password-error"
                className="form-field-error"
                role="alert"
              >
                {fieldErrors.currentPassword}
              </p>
            )}
          </div>
          <PasswordField
            id="new-password"
            name="newPassword"
            label="New password"
            value={newPassword}
            onChange={(value) => {
              setNewPassword(value);
              clearFieldError("newPassword");
            }}
            placeholder="••••••••"
            autoComplete="new-password"
            showRules
            disabled={changeMutation.isPending}
            error={fieldErrors.newPassword}
          />
          <PasswordField
            id="confirm-password"
            name="confirmPassword"
            label="Confirm new password"
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              clearFieldError("confirmPassword");
            }}
            autoComplete="new-password"
            placeholder="••••••••"
            disabled={changeMutation.isPending}
            error={fieldErrors.confirmPassword}
          />
        </div>

        <div className="profile-section-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={changeMutation.isPending}
          >
            {changeMutation.isPending ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * User profile page.
 *
 * Allows users to manage:
 * - General details (name, theme)
 * - Password change
 */
export function ProfilePage() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return <ProfilePageSkeleton />;
  }

  return (
    <div className="profile-page">
      <BackLink to="/servers" label="Back" />

      <header className="dashboard-header">
        <div>
          <h1>Profile</h1>
          <p>Manage your account settings.</p>
        </div>
      </header>

      <div className="profile-page-body">
        <GeneralDetailsCard />
        <ChangePasswordCard />
      </div>
    </div>
  );
}
