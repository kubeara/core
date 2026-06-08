export interface ProfileOrganization {
  id: string;
  name: string;
  logo?: string | null;
}

export interface ProfileUser {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  profilePictureUrl?: string | null;
  dateOfBirth?: number | null;
  organization?: ProfileOrganization;
}
