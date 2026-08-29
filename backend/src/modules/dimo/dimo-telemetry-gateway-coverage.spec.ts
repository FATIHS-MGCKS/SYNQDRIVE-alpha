import * as fs from 'fs';
import * as path from 'path';

/**
 * Static guard: every telemetry HTTP exit in DimoTelemetryService must route
 * through DimoProviderGateway.execute (P1.3-S1 canonical coverage).
 */
describe('DimoTelemetryService gateway coverage guard', () => {
  const telemetryServicePath = path.join(__dirname, 'dimo-telemetry.service.ts');

  it('wraps each this.client.post in providerGateway.execute', () => {
    const src = fs.readFileSync(telemetryServicePath, 'utf8');
    const postCalls = src.match(/this\.client\.post/g) ?? [];
    const gatewayCalls = src.match(/this\.providerGateway\.execute/g) ?? [];

    expect(postCalls.length).toBeGreaterThan(0);
    expect(gatewayCalls.length).toBe(postCalls.length);
  });

  it('does not expose queryGraphQL HTTP outside postGraphQL private helper', () => {
    const src = fs.readFileSync(telemetryServicePath, 'utf8');
    const postGraphQLBlock = src.slice(
      src.indexOf('private async postGraphQL'),
      src.indexOf('async fetchVehicleSummary'),
    );
    expect(postGraphQLBlock).toContain('this.client.post');
    expect(src.indexOf('private async postGraphQL')).toBeGreaterThan(-1);
  });
});
