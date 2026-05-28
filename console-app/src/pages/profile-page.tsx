import { useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/api/api-error";
import {
    useChangeProfilePasswordMutation,
    useUpdateGeneralProfileMutation,
    useUpdateOrganizationMutation,
} from "@/features/profile/hooks";
import { useAuth } from "@/features/auth/context/use-auth";
import { readImageAsDataUrl } from "@/lib/read-image";
import { getUserInitials } from "@/lib/user-display";
import "@/components/profile-page.css";

function GeneralDetailsCard() {
    const { user } = useAuth();
    const updateMutation = useUpdateGeneralProfileMutation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [profilePicture, setProfilePicture] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        const parts = user.name.split(/\s+/).filter(Boolean);
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
        setProfilePicture(null);
    }, [user]);

    if (!user) return null;

    async function handleImageChange(file: File | undefined) {
        if (!file) return;
        setError(null);
        try {
            const dataUrl = await readImageAsDataUrl(file);
            setProfilePicture(dataUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid image.");
        }
    }

    function removePhoto() {
        setProfilePicture(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        try {
            await updateMutation.mutateAsync({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                profilePicture,
            });
            setSuccess("Profile updated.");
        } catch (err) {
            setError(getErrorMessage(err));
        }
    }

    return (
        <section className="profile-section-card">
            <h2>General details</h2>
            <p className="profile-section-desc">
                Your name and profile photo appear across the workspace.
            </p>
            <form onSubmit={handleSubmit} className="profile-section-form">
                <div className="profile-avatar-block">
                    <div className="profile-avatar-upload">
                        <div className="profile-avatar-preview">
                            {profilePicture ? (
                                <img src={profilePicture} alt="" />
                            ) : (
                                getUserInitials({ name: `${firstName} ${lastName}`.trim() || user.name })
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="profile-avatar-input"
                            aria-label="Upload profile photo"
                            onChange={(e) => void handleImageChange(e.target.files?.[0])}
                            disabled={updateMutation.isPending}
                        />
                    </div>
                    <div className="profile-avatar-actions">
                        <p className="profile-avatar-hint">PNG, JPG or WebP. Max 500 KB.</p>
                        {profilePicture && (
                            <button
                                type="button"
                                className="profile-text-btn"
                                onClick={removePhoto}
                                disabled={updateMutation.isPending}
                            >
                                Remove photo
                            </button>
                        )}
                    </div>
                </div>

                <div className="form-field">
                    <label htmlFor="profile-email">Email</label>
                    <div id="profile-email" className="profile-email-readonly">
                        {user.email}
                    </div>
                </div>

                <div className="form-field">
                    <label htmlFor="profile-first-name">First name</label>
                    <input
                        id="profile-first-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        autoComplete="given-name"
                        disabled={updateMutation.isPending}
                    />
                </div>

                <div className="form-field">
                    <label htmlFor="profile-last-name">Last name</label>
                    <input
                        id="profile-last-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        autoComplete="family-name"
                        disabled={updateMutation.isPending}
                    />
                </div>

                {error && <p className="form-message error">{error}</p>}
                {success && <p className="form-message success">{success}</p>}

                <div className="profile-section-actions">
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={updateMutation.isPending}
                    >
                        {updateMutation.isPending ? "Saving…" : "Save changes"}
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
                <div className="form-field">
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

function OrganizationCard() {
    const { user } = useAuth();
    const updateMutation = useUpdateOrganizationMutation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [orgName, setOrgName] = useState("");
    const [orgLogo, setOrgLogo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        setOrgName(user.organization?.name || "");
        setOrgLogo(null);
    }, [user]);

    if (!user) return null;

    async function handleLogoChange(file: File | undefined) {
        if (!file) return;
        setError(null);
        try {
            const dataUrl = await readImageAsDataUrl(file);
            setOrgLogo(dataUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid image.");
        }
    }

    function removeLogo() {
        setOrgLogo(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        try {
            await updateMutation.mutateAsync({
                orgName: orgName.trim(),
                orgLogo,
            });
            setSuccess("Organization updated.");
        } catch (err) {
            setError(getErrorMessage(err));
        }
    }

    return (
        <section className="profile-section-card">
            <h2>Organization details</h2>
            <p className="profile-section-desc">
                Your organization name and logo are shown on shared resources.
            </p>
            <form onSubmit={handleSubmit} className="profile-section-form">
                <div className="profile-logo-block">
                    <div className="profile-logo-upload">
                        <div className="profile-logo-preview">
                            {orgLogo ? (
                                <img src={orgLogo} alt="" />
                            ) : (
                                "Logo"
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="profile-logo-input"
                            aria-label="Upload organization logo"
                            onChange={(e) => void handleLogoChange(e.target.files?.[0])}
                            disabled={updateMutation.isPending}
                        />
                    </div>
                    <div className="profile-avatar-actions">
                        <p className="profile-avatar-hint">Square logo works best. Max 500 KB.</p>
                        {orgLogo && (
                            <button
                                type="button"
                                className="profile-text-btn"
                                onClick={removeLogo}
                                disabled={updateMutation.isPending}
                            >
                                Remove logo
                            </button>
                        )}
                    </div>
                </div>

                <div className="form-field">
                    <label htmlFor="org-name">Organization name</label>
                    <input
                        id="org-name"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        required
                        placeholder="Acme Inc."
                        disabled={updateMutation.isPending}
                    />
                </div>

                {error && <p className="form-message error">{error}</p>}
                {success && <p className="form-message success">{success}</p>}

                <div className="profile-section-actions">
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={updateMutation.isPending}
                    >
                        {updateMutation.isPending ? "Saving…" : "Save changes"}
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
 * - General details (name, profile picture)
 * - Password change
 * - Organization details (name, logo)
 */
export function ProfilePage() {
    const { user, isLoading } = useAuth();

    if (isLoading || !user) {
        return null;
    }

    return (
        <div className="profile-page">
            <header className="dashboard-header">
                <div>
                    <h1>Profile</h1>
                    <p>Manage your account and organization settings.</p>
                </div>
            </header>

            <div className="profile-page-layout">
                <GeneralDetailsCard />
                <ChangePasswordCard />
                <OrganizationCard />
            </div>
        </div>
    );
}
