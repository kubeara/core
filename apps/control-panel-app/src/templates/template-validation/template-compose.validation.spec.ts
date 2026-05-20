import {
    parseCpuToCores,
    parseMemoryToBytes,
    validateTemplateComposeFile,
} from './template-compose.validation';

describe('template-compose.validation', () => {
    const validCompose = `
# documentation: https://example.com
# port: 8080

services:
  app:
    image: example/app:1
    restart: unless-stopped
    ports:
      - '\${SERVICE_PORT_APP:-8080}:8080'
    environment:
      APP_PASSWORD: \${SERVICE_PASSWORD_APP}
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health']
      interval: 10s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
`;

    it('accepts a valid compose-only template', () => {
        const result = validateTemplateComposeFile({
            slug: 'app',
            composePath: '/tmp/app/docker-compose.yml',
            composeYaml: validCompose,
            hasTemplateConfig: false,
        });

        expect(result.valid).toBe(true);
        expect(result.issues).toEqual([]);
    });

    it('reports invalid yaml syntax', () => {
        const result = validateTemplateComposeFile({
            slug: 'broken',
            composePath: '/tmp/broken/docker-compose.yml',
            composeYaml: 'services:\n  app: [',
            hasTemplateConfig: false,
        });

        expect(result.valid).toBe(false);
        expect(result.issues[0]?.path).toBe('root');
    });

    it('requires healthcheck, resource limits, and logging limits', () => {
        const result = validateTemplateComposeFile({
            slug: 'minimal',
            composePath: '/tmp/minimal/docker-compose.yml',
            composeYaml: `
# documentation: https://example.com
# port: 8080

services:
  app:
    image: example/app:1
    restart: unless-stopped
    ports:
      - '\${SERVICE_PORT_APP:-8080}:8080'
`,
            hasTemplateConfig: false,
        });

        expect(result.valid).toBe(false);
        expect(result.issues.map((issue) => issue.path)).toEqual(
            expect.arrayContaining([
                'services.app.healthcheck',
                'services.app.deploy.resources',
                'services.app.logging',
            ]),
        );
    });

    it('parses memory and cpu limits', () => {
        expect(parseMemoryToBytes('512M')).toBe(512 * 1024 * 1024);
        expect(parseMemoryToBytes('1G')).toBe(1024 * 1024 * 1024);
        expect(parseCpuToCores('500m')).toBe(0.5);
        expect(parseCpuToCores('2')).toBe(2);
    });
});
