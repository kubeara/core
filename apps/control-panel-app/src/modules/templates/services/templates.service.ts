import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplatePayloadService } from '@shared/common';

import { ServiceTemplateEntity } from '../entities/service-template.entity';

const yaml = require('js-yaml') as {
    dump(
        input: unknown,
        options?: {
            lineWidth?: number;
            noRefs?: boolean;
        },
    ): string;
};

type ComposeJson = Record<string, unknown>;

export type TemplateResponse =
    | {
        slug: string;
        compose: string;
    }
    | {
        slug: string;
        compose: ComposeJson;
    };

@Injectable()
export class TemplatesService {
    constructor(
        @InjectRepository(ServiceTemplateEntity)
        private readonly serviceTemplateRepository: Repository<ServiceTemplateEntity>,
        private readonly templatePayloadService: TemplatePayloadService,
    ) { }

    async getTemplate(slug: string, format: string = 'yml'): Promise<TemplateResponse> {
        const template = await this.getTemplateEntity(slug);
        const normalizedFormat = format.toLowerCase();

        switch (normalizedFormat) {
            case 'base64':
                return { slug: template.slug, compose: template.compose };

            case 'json':
                return {
                    slug: template.slug,
                    compose: this.templatePayloadService.decodeBase64ToObject(template.compose),
                };

            case 'yml':
            case 'yaml':
                return {
                    slug: template.slug,
                    compose: yaml.dump(this.templatePayloadService.decodeBase64ToObject(template.compose), {
                        lineWidth: -1,
                        noRefs: true,
                    }),
                };

            default:
                throw new BadRequestException(
                    `Unsupported format '${format}'. Supported formats: yml, yaml, json, base64.`,
                );
        }
    }

    async getTemplateEntity(slug: string): Promise<ServiceTemplateEntity> {
        const template = await this.serviceTemplateRepository.findOne({ where: { slug } });

        if (!template) {
            throw new NotFoundException(`Template '${slug}' not found`);
        }

        return template;
    }
}
