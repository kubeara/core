import { Module } from '@nestjs/common';

import { ComposeParserService } from './compose-parser.service';

@Module({
    providers: [ComposeParserService],
    exports: [ComposeParserService],
})
export class ComposeParserModule {}
