import * as fs from 'fs';
import * as path from 'path';
import { scanDimoProviderCallSites } from '../../../../dimo/provider/dimo-provider-call-site-audit.util';
import { acquireDiV0HistoricalPositions } from '../di-v0-position-acquisition';
import { DiV0VehicleJwtUnavailableError } from '../di-v0-position-errors';
import { DimoTelemetryDiV0HistoricalPositionTransport } from '../dimo-telemetry-di-v0-position.transport';
import { buildRequest, expectAcquired, expectFailed, labelAt, row } from './position-acquisition-test-helpers';

const PACKAGE_DIR = path.join(__dirname, '..');
const BACKEND_SRC = path.join(__dirname, '../../../../..');
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXRlc3Q';
const BASE = '2026-09-26T10:00:00Z';

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') walkTs(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function isTestFile(file: string): boolean {
  return file.includes('/__tests__/') || /\.(spec|test)\.ts$/.test(file);
}

describe('S3A dormant boundary (static)', () => {
  const productionFiles = walkTs(PACKAGE_DIR).filter((f) => !isTestFile(f));

  it('package files import no runtime frameworks, persistence, queues or env', () => {
    const forbidden = [
      '@prisma/client',
      'PrismaService',
      '@nestjs/',
      'bullmq',
      'ioredis',
      'redis',
      'process.env',
      'DimoSegmentsService',
      '@Injectable',
      '@Controller',
      '@Processor',
      'console.',
      'Logger',
    ];
    for (const file of productionFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const token of forbidden) {
        expect({ file: path.basename(file), token, found: content.includes(token) }).toEqual({
          file: path.basename(file),
          token,
          found: false,
        });
      }
    }
  });

  it('DIMO services are imported as types only (adapter receives instances)', () => {
    const adapter = fs.readFileSync(path.join(PACKAGE_DIR, 'dimo-telemetry-di-v0-position.transport.ts'), 'utf8');
    expect(adapter).toMatch(/import type \{ DimoAuthService \}/);
    expect(adapter).toMatch(/import type \{ DimoTelemetryService \}/);
  });

  it('no runtime caller: nothing outside the package references S3A', () => {
    const markers = [
      'position-acquisition',
      'acquireDiV0HistoricalPositions',
      'DimoTelemetryDiV0HistoricalPositionTransport',
      'normalizeDiV0PositionResponse',
    ];
    const hits = walkTs(BACKEND_SRC)
      .filter((f) => !f.startsWith(PACKAGE_DIR))
      .filter((f) => {
        const content = fs.readFileSync(f, 'utf8');
        return markers.some((m) => content.includes(m));
      });
    expect(hits).toEqual([]);
  });

  it('DIMO call-site audit classifies the adapter as FULL_CONTEXT_REQUIRED', () => {
    const entries = scanDimoProviderCallSites().filter((e) =>
      e.file.includes('driving-intelligence/position-acquisition/'),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].classification).toBe('FULL_CONTEXT_REQUIRED');
  });
});

describe('S3A DIMO transport adapter (mocked, no network)', () => {
  function mocks(jwt: string | null = FAKE_JWT, body: unknown = { data: { signals: [row(BASE, 51, 9)] } }) {
    const auth = { getVehicleJwt: jest.fn().mockResolvedValue(jwt) };
    const telemetry = { queryGraphQL: jest.fn().mockResolvedValue(body) };
    return { auth, telemetry, transport: new DimoTelemetryDiV0HistoricalPositionTransport(auth, telemetry) };
  }

  it('uses the shared auth + telemetry transport with full tenant request context', async () => {
    const { auth, telemetry, transport } = mocks();
    const result = expectAcquired(
      await acquireDiV0HistoricalPositions(buildRequest(BASE, labelAt(BASE, 2)), transport, {}),
    );
    expect(auth.getVehicleJwt).toHaveBeenCalledWith(424242);
    expect(telemetry.queryGraphQL).toHaveBeenCalledTimes(1);
    const [jwt, query, variables, context] = telemetry.queryGraphQL.mock.calls[0];
    expect(jwt).toBe(FAKE_JWT);
    expect(query).toContain('interval: "1s"');
    expect(variables).toBeUndefined();
    expect(context).toEqual({ tokenId: 424242, vehicleId: 'vehicle-test', organizationId: 'org-test' });
    expect(JSON.stringify(result)).not.toContain(FAKE_JWT);
  });

  it('missing vehicle JWT → AUTHENTICATION without calling telemetry', async () => {
    const { telemetry, transport } = mocks('');
    const failure = expectFailed(
      await acquireDiV0HistoricalPositions(buildRequest(BASE, labelAt(BASE, 2)), transport, {}),
    );
    expect(failure.failureClass).toBe('AUTHENTICATION');
    expect(telemetry.queryGraphQL).not.toHaveBeenCalled();
    expect(new DiV0VehicleJwtUnavailableError().message).not.toMatch(/eyJ/);
  });

  it('auth failure message containing a token is not leaked', async () => {
    const auth = { getVehicleJwt: jest.fn().mockRejectedValue(new Error(`auth failed Bearer ${FAKE_JWT}`)) };
    const telemetry = { queryGraphQL: jest.fn() };
    const transport = new DimoTelemetryDiV0HistoricalPositionTransport(auth, telemetry);
    const failure = expectFailed(
      await acquireDiV0HistoricalPositions(buildRequest(BASE, labelAt(BASE, 2)), transport, {}),
    );
    expect(failure.safeMessage).not.toContain(FAKE_JWT);
  });
});
