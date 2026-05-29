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
 * 
 * @example
 * const user = await updateGeneralProfile({
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   profilePicture: 'data:image/png;base64,...'
 * });
 */
export async function updateGeneralProfile(
    input: UpdateGeneralProfileRequest,
): Promise<User> {
    const response = await apiClient.patch<ProfileApiResponse<User>>(
        "/profile/general",
        input,
    );
    const user = response.data.user;
    if (!user) {
        throw new Error("No user data in response");
    }
    return user;
}

/**
 * Change user's password.
 * 
 * @param input - Current and new password
 * @returns Success message
 * @throws {ApiError} If password change fails (e.g., incorrect current password)
 * 
 * @example
 * const result = await changeProfilePassword({
 *   currentPassword: 'oldPassword123',
 *   newPassword: 'newPassword456'
 * });
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
 * 
 * @example
 * const user = await updateOrganizationProfile({
 *   orgName: 'Acme Inc.',
 *   orgLogo: 'data:image/png;base64,...'
 * });
 */
export async function updateOrganizationProfile(
    input: UpdateOrganizationRequest,
): Promise<User> {
    const response = await apiClient.patch<ProfileApiResponse<User>>(
        "/profile/organization",
        input,
    );
    const user = response.data.user;
    if (!user) {
        throw new Error("No user data in response");
    }
    return user;
}
