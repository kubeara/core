import { useEffect, useState } from "react";
import { getErrorMessage } from "@/api/api-error";
import {
  useChangeProfilePasswordMutation,
  useUpdateGeneralProfileMutation,
} from "@/features/profile/hooks";
import { useAuth } from "@/features/auth/context/use-auth";
import { ProfilePageSkeleton } from "@/components/shared/skeleton";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import "@/components/profile-page.css";

function GeneralDetailsCard() {
  const { user } = useAuth();
  const updateMutation = useUpdateGeneralProfileMutation();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSaving = updateMutation.isPending;

  useEffect(() => {
    if (!user) return;
    const parts = user.name.split(/\s+/).filter(Boolean);
    setFirstName(parts[0] || "");
    setLastName(parts.slice(1).join(" ") || "");
  }, [user]);

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      await updateMutation.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setSuccess("Profile updated.");
    } catch (err) {
      setError(getErrorMessage(err));
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
      <form onSubmit={handleSubmit} className="profile-section-form">
        <div className="profile-field-group">
          <div className="profile-form-grid">
            <div className="form-field">
              <label htmlFor="profile-first-name">First name</label>
              <input
                id="profile-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoComplete="given-name"
                disabled={isSaving}
              />
            </div>

            <div className="form-field">
              <label htmlFor="profile-last-name">Last name</label>
              <input
                id="profile-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                disabled={isSaving}
              />
            </div>

            <div className="form-field">
              <label htmlFor="profile-email">Email</label>
              <div id="profile-email" className="profile-email-readonly">
                {user.email}
              </div>
            </div>
          </div>
        </div>

        {error && <p className="form-message error">{error}</p>}
        {success && <p className="form-message success">{success}</p>}

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const form = e.currentTarget;
    const currentPassword = (
      form.elements.namedItem("currentPassword") as HTMLInputElement
    ).value;
    const newPassword = (
      form.elements.namedItem("newPassword") as HTMLInputElement
    ).value;
    const confirmPassword = (
      form.elements.namedItem("confirmPassword") as HTMLInputElement
    ).value;

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    try {
      const data = await changeMutation.mutateAsync({
        currentPassword,
        newPassword,
      });
      setSuccess(data.message);
      form.reset();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <section className="profile-section-card">
      <h2>Change password</h2>
      <p className="profile-section-desc">
        Use a strong password you do not reuse on other sites.
      </p>
      <form onSubmit={handleSubmit} className="profile-section-form">
        <div className="profile-form-grid profile-form-grid--narrow">
          <div className="form-field profile-form-grid-span-2">
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              disabled={changeMutation.isPending}
            />
          </div>
          <div className="form-field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={changeMutation.isPending}
            />
          </div>
          <div className="form-field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={changeMutation.isPending}
            />
          </div>
        </div>

        {error && <p className="form-message error">{error}</p>}
        {success && <p className="form-message success">{success}</p>}

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
