import * as fs from 'fs';
import * as path from 'path';

/**
 * Static guard: telemetry HTTP exits route through S4 gateway (canary/limiter)
 * and P1.3 global budget executor (Redis lease semaphore).
 */
describe('DimoTelemetryService gateway + executor coverage guard', () => {
  const telemetryServicePath = path.join(__dirname, 'dimo-telemetry.service.ts');

  it('wraps each this.client.post in dimoRequestExecutor.execute', () => {
    const src = fs.readFileSync(telemetryServicePath, 'utf8');
    const postCalls = src.match(/this\.client\.post/g) ?? [];
    const executorCalls = src.match(/this\.dimoRequestExecutor\.execute/g) ?? [];

    expect(postCalls.length).toBeGreaterThan(0);
    expect(executorCalls.length).toBe(postCalls.length);
  });

  it('routes outbound telemetry through providerGateway.execute for canary context', () => {
    const src = fs.readFileSync(telemetryServicePath, 'utf8');
    const gatewayCalls = src.match(/this\.providerGateway\.execute/g) ?? [];

    expect(gatewayCalls.length).toBe(3);
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
