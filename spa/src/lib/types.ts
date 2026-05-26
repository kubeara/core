export type Organization = {
  name: string;
  logo: string | null;
};

export type User = {
  id: string;
  email: string;
  /** Display name synced from first + last name */
  name: string;
  firstName: string;
  lastName: string;
  profilePicture: string | null;
  organization: Organization;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
};

export type ServerStatus = "online" | "offline" | "pending" | "error";

export type Server = {
  id: string;
  name: string;
  username: string;
  host: string;
  status: ServerStatus;
  createdAt: string;
};
