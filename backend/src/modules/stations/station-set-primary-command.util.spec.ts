import { Prisma } from '@prisma/client';
import { StationLifecycleWarningCode } from '@shared/stations/station-lifecycle.policy';
import { StationSetPrimaryCommandIssueCode, StationSetPrimaryCommandOutcome } from './station-set-primary-command.types';
import {
  buildStationSetPrimaryConflictIssue,
  evaluateStationSetPrimaryCommand,
  isStationPrimaryUniqueViolation,
  STATION_PRIMARY_UNIQUE_INDEX,
} from './station-set-primary-command.util';

describe('evaluateStationSetPrimaryCommand', () => {
  const baseStation = {
    id: 'station-a',
    status: 'ACTIVE' as const,
    isPrimary: false,
    pickupEnabled: true,
    returnEnabled: true,
    archivedAt: null,
  };

  it('allows set-primary on active station', () => {
    const result = evaluateStationSetPrimaryCommand({
      station: baseStation,
      preflight: {
        stationId: 'station-a',
        organizationId: 'org-a',
        status: 'ACTIVE',
        isPrimary: false,
        nonArchivedPrimaryCount: 1,
        otherPrimaryStationIds: ['station-b'],
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.outcome).toBe(StationSetPrimaryCommandOutcome.APPLIED);
  });

  it('returns idempotent outcome when station is sole primary', () => {
    const result = evaluateStationSetPrimaryCommand({
      station: { ...baseStation, isPrimary: true },
      preflight: {
        stationId: 'station-a',
        organizationId: 'org-a',
        status: 'ACTIVE',
        isPrimary: true,
        nonArchivedPrimaryCount: 1,
        otherPrimaryStationIds: [],
      },
    });

    expect(result.idempotent).toBe(true);
    expect(result.outcome).toBe(StationSetPrimaryCommandOutcome.IDEMPOTENT);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: StationLifecycleWarningCode.IDEMPOTENT_SET_PRIMARY }),
      ]),
    );
  });

  it('blocks set-primary on inactive station', () => {
    const result = evaluateStationSetPrimaryCommand({
      station: { ...baseStation, status: 'INACTIVE' },
      preflight: {
        stationId: 'station-a',
        organizationId: 'org-a',
        status: 'INACTIVE',
        isPrimary: false,
        nonArchivedPrimaryCount: 0,
        otherPrimaryStationIds: [],
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.outcome).toBe(StationSetPrimaryCommandOutcome.BLOCKED);
  });
});

describe('isStationPrimaryUniqueViolation', () => {
  it('detects partial unique index violations', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: [STATION_PRIMARY_UNIQUE_INDEX] },
    });

    expect(isStationPrimaryUniqueViolation(error)).toBe(true);
  });

  it('ignores unrelated unique violations', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['stations_organization_id_code_key'] },
    });

    expect(isStationPrimaryUniqueViolation(error)).toBe(false);
  });
});

describe('buildStationSetPrimaryConflictIssue', () => {
  it('returns PRIMARY_CONFLICT issue', () => {
    expect(buildStationSetPrimaryConflictIssue()).toEqual(
      expect.objectContaining({ code: StationSetPrimaryCommandIssueCode.PRIMARY_CONFLICT }),
    );
  });
});
