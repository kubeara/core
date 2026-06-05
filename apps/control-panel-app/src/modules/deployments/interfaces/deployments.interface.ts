export interface EnvironmentVariableView {
  key: string;
  value: string | null;
  isRequired: boolean;
  isGenerated: boolean;
  comment: string | null;
  updatedAt: number;
}
