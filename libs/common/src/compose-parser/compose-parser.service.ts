import { Injectable } from '@nestjs/common';

import {
    ResolveComposeEnvOptions,
    ResolvedComposeEnv,
    ServerUrlContext,
    extractComposeVariables,
    findMissingComposeVariables,
    inferRequiredComposeVariables,
    findUnknownPortKeys,
    listComposePortVariables,
    resolveAndValidateComposeEnvironment,
    resolveComposeEnvironment,
} from './compose-parser.util';

@Injectable()
export class ComposeParserService {
    /**
     * Extracts all compose placeholder variables from the yaml string.
     * @param compose Compose yaml content to inspect.
     * @returns Discovered variable references including defaults.
     */
    extractVariables(compose: string) {
        try {
            return extractComposeVariables(compose);
        } catch (error) {
            throw new Error(`Failed to extract compose variables: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Resolves compose env and port variables without strict missing-key validation.
     * @param options Compose resolution options and input overrides.
     * @returns Resolved env values, port values, and generated key list.
     */
    resolveFromCompose(options: ResolveComposeEnvOptions): ResolvedComposeEnv {
        try {
            return resolveComposeEnvironment(options);
        } catch (error) {
            throw new Error(`Failed to resolve compose values: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Resolves compose variables and validates all required placeholders.
     * @param options Compose resolution options and input overrides.
     * @returns Fully resolved environment output for deployment.
     */
    resolveAndValidateFromCompose(options: ResolveComposeEnvOptions): ResolvedComposeEnv {
        try {
            return resolveAndValidateComposeEnvironment(options);
        } catch (error) {
            throw new Error(`Failed to resolve and validate compose values: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Lists required compose placeholders not expected to be auto-generated.
     * @param compose Compose yaml content to inspect.
     * @param options Optional server URL context for URL/FQDN generation rules.
     * @returns Required placeholder names.
     */
    inferRequiredVariables(compose: string, options?: { serverUrlContext?: ServerUrlContext }): string[] {
        try {
            return inferRequiredComposeVariables(compose, options);
        } catch (error) {
            throw new Error(`Failed to infer required compose variables: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Finds still-missing placeholders after compose resolution.
     * @param compose Compose yaml content to inspect.
     * @param resolved Previously resolved env and port values.
     * @returns Missing placeholder names.
     */
    findMissingVariables(compose: string, resolved: ResolvedComposeEnv): string[] {
        try {
            return findMissingComposeVariables(compose, resolved);
        } catch (error) {
            throw new Error(`Failed to find missing compose variables: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Lists declared SERVICE_PORT_* placeholders from compose yaml.
     * @param compose Compose yaml content to inspect.
     * @returns Port placeholder keys.
     */
    listPortVariables(compose: string): string[] {
        try {
            return listComposePortVariables(compose);
        } catch (error) {
            throw new Error(`Failed to list compose port variables: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Returns request port keys that are not declared in compose placeholders.
     * @param compose Compose yaml content to inspect.
     * @param userPorts Incoming user-provided port values.
     * @returns Unknown port keys.
     */
    findUnknownPortKeys(compose: string, userPorts: Record<string, unknown>): string[] {
        try {
            return findUnknownPortKeys(compose, userPorts);
        } catch (error) {
            throw new Error(`Failed to find unknown port keys: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
