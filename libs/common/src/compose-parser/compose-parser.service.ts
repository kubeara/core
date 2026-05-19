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
    extractVariables(compose: string) {
        return extractComposeVariables(compose);
    }

    resolveFromCompose(options: ResolveComposeEnvOptions): ResolvedComposeEnv {
        return resolveComposeEnvironment(options);
    }

    resolveAndValidateFromCompose(options: ResolveComposeEnvOptions): ResolvedComposeEnv {
        return resolveAndValidateComposeEnvironment(options);
    }

    inferRequiredVariables(compose: string, options?: { serverUrlContext?: ServerUrlContext }): string[] {
        return inferRequiredComposeVariables(compose, options);
    }

    findMissingVariables(compose: string, resolved: ResolvedComposeEnv): string[] {
        return findMissingComposeVariables(compose, resolved);
    }

    listPortVariables(compose: string): string[] {
        return listComposePortVariables(compose);
    }

    findUnknownPortKeys(compose: string, userPorts: Record<string, unknown>): string[] {
        return findUnknownPortKeys(compose, userPorts);
    }
}
