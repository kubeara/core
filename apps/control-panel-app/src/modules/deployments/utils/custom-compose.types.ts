import type {
  ResolvedComposeEnv,
  TemplateVariableDefinition,
} from "@shared/common";

export interface CustomComposeValidationIssue {
  path: string;
  message: string;
}

export interface DotEnvParseResult {
  variables: Record<string, string>;
  issues: CustomComposeValidationIssue[];
}

export interface CustomComposeServiceEnvironment {
  serviceName: string;
  env: Record<string, string>;
}

export interface CustomComposeCombinedValidationResult {
  issues: CustomComposeValidationIssue[];
  dotEnvVariables: Record<string, string>;
  resolved: ResolvedComposeEnv;
  serviceEnvironments: CustomComposeServiceEnvironment[];
}

export interface CustomComposeValidationSuccess {
  valid: true;
  composeYaml: string;
  envFileContent: string;
  /** Auto-generated hint; the user chooses the final templateSlug on configure. */
  suggestedTemplateSlug: string;
  variables: TemplateVariableDefinition[];
  serviceEnvironments: CustomComposeServiceEnvironment[];
}

export interface CustomComposeValidationFailure {
  valid: false;
  issues: CustomComposeValidationIssue[];
}

export type CustomComposeValidationResult =
  CustomComposeValidationSuccess | CustomComposeValidationFailure;

export interface ParsedCustomEnvEntry {
  name: string;
  defaultValue: string | number | boolean | null;
  hasDefaultSyntax: boolean;
  hasRequiredOccurrence: boolean;
}

export interface CustomComposeEncryptedContent {
  composeYaml: string;
  envFileContent?: string;
}

export interface CustomComposeResolvedEnv {
  env: Record<string, string>;
  ports: Record<string, number>;
  generatedKeys: string[];
  requiredKeys: Set<string>;
}
