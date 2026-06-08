import type { User } from "@/types";

/**
 * Standard API success response wrapper from backend
 */
export type ProfileApiResponse<T = unknown> = {
    success?: boolean;
    statusCode?: number;
    message: string;
    data?: T;
};

/**
 * Request payload for updating general profile
 */
export type UpdateGeneralProfileRequest = {
    firstName: string;
    lastName: string;
    profilePicture?: string | null;
};

/**
 * Request payload for changing password
 */
export type ChangePasswordRequest = {
    currentPassword: string;
    newPassword: string;
};

/**
 * Response from password change
 */
export type ChangePasswordResponse = {
    message: string;
};

/**
 * Request payload for updating organization
 */
export type UpdateOrganizationRequest = {
    orgName: string;
    orgLogo?: string | null;
};

/**
 * Profile update response (returns updated user)
 */
export type ProfileUpdateResponse = User;
