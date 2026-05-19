import { Injectable } from '@nestjs/common';

import {
    ResolveComposeEnvOptions,
    ResolvedComposeEnv,
    extractComposeVariables,
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
}
