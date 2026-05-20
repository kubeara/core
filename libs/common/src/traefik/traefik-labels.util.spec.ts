import {
    buildTraefikLabels,
    discoverTraefikRoutes,
    applyTraefikRoutingToCompose,
    KUBEARA_PROXY_NETWORK,
} from './traefik-labels.util';

describe('traefik-labels.util', () => {
    const n8nCompose = `
services:
  n8n:
    ports:
      - '\${SERVICE_PORT_N8N:-5678}:5678'
    environment:
      - SERVICE_URL_N8N_5678
`;

    it('buildTraefikLabels sets host router on port 80 entrypoint', () => {
        const labels = buildTraefikLabels({
            routerId: 'dep-1',
            host: 'n8n-test.127.0.0.1.sslip.io',
            internalPort: 5678,
        });

        expect(labels['traefik.enable']).toBe('true');
        expect(labels['traefik.http.routers.dep-1-http.rule']).toBe(
            'Host(`n8n-test.127.0.0.1.sslip.io`)',
        );
        expect(labels['traefik.http.services.dep-1-http.loadbalancer.server.port']).toBe('5678');
    });

    it('discoverTraefikRoutes prefers host-only FQDN over port-suffixed', () => {
        const env = {
            SERVICE_FQDN_N8N: 'n8n-test.127.0.0.1.sslip.io',
            SERVICE_FQDN_N8N_5678: 'n8n-test.127.0.0.1.sslip.io:5678',
        };

        const routes = discoverTraefikRoutes(n8nCompose, env, 'deployment-abc');

        expect(routes).toHaveLength(1);
        expect(routes[0].host).toBe('n8n-test.127.0.0.1.sslip.io');
        expect(routes[0].internalPort).toBe(5678);
    });

    it('applyTraefikRoutingToCompose removes host ports and attaches proxy network', () => {
        const compose: Record<string, unknown> = {
            services: {
                n8n: {
                    ports: ['5678:5678'],
                    labels: {},
                },
            },
        };

        applyTraefikRoutingToCompose(compose, [
            {
                serviceKey: 'n8n',
                host: 'n8n.local',
                internalPort: 5678,
                routerId: 'dep',
            },
        ]);

        const services = compose.services as Record<string, Record<string, unknown>>;
        const networks = compose.networks as Record<string, unknown>;

        expect(services.n8n.ports).toBeUndefined();
        expect(services.n8n.networks).toEqual([KUBEARA_PROXY_NETWORK, 'default']);
        expect(networks[KUBEARA_PROXY_NETWORK]).toEqual({ external: true });
    });
});
