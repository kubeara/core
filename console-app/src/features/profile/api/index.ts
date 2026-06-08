import { apiClient } from "@/api/axios";
import type { User } from "@/types";
import type {
    ChangePasswordRequest,
    ChangePasswordResponse,
    ProfileApiResponse,
    UpdateGeneralProfileRequest,
    UpdateOrganizationRequest,
} from "../types";

/**
 * Update user's general profile information.
 *
 * @param input - Profile data (firstName, lastName, profilePicture)
 * @returns Updated user object
 * @throws {ApiError} If update fails
 */
export async function updateGeneralProfile(
    input: UpdateGeneralProfileRequest,
): Promise<{ user: User; message: string }> {
    const response = await apiClient.patch<ProfileApiResponse<User>>(
        "/profile/general",
        input,
    );
    const user = response.data.data;
    if (!user) {
        throw new Error("No user data in response");
    }
    return {
        user,
        message: response.data.message ?? "Profile updated successfully",
    };
}

/**
 * Change user's password.
 *
 * @param input - Current and new password
 * @returns Success message
 * @throws {ApiError} If password change fails (e.g., incorrect current password)
 */
export async function changeProfilePassword(
    input: ChangePasswordRequest,
): Promise<ChangePasswordResponse> {
    const response = await apiClient.post<ProfileApiResponse>(
        "/profile/password",
        input,
    );
    return { message: response.data.message ?? "Password updated" };
}

/**
 * Update organization profile information.
 *
 * @param input - Organization data (orgName, orgLogo)
 * @returns Updated user object with organization data
 * @throws {ApiError} If update fails
 */
export async function updateOrganizationProfile(
    input: UpdateOrganizationRequest,
): Promise<User> {
    const response = await apiClient.patch<ProfileApiResponse<User>>(
        "/profile/organization",
        input,
    );
    const user = response.data.data;
    if (!user) {
        throw new Error("No user data in response");
    }
    return user;
}
