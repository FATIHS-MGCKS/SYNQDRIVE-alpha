import {
  dedupeHomeAssignmentProposals,
  evaluateHomeAssignmentPreviewItem,
  summarizeHomeAssignmentPreviewItems,
} from './vehicle-home-assignment-preview.util';
import {
  HomeAssignmentExecutableCommand,
  HomeAssignmentPreviewAction,
  HomeAssignmentPreviewIssueCode,
} from './vehicle-home-assignment-preview.types';

describe('vehicle-home-assignment-preview.util', () => {
  const ORG_CONTEXT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const STATION_ARCHIVED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const VEHICLE_1 = '11111111-1111-4111-8111-111111111111';

  const stations = new Map([
    [STATION_A, { id: STATION_A, name: 'Station A', status: 'ACTIVE' as const }],
    [STATION_B, { id: STATION_B, name: 'Station B', status: 'ACTIVE' as const }],
    [
      STATION_ARCHIVED,
      { id: STATION_ARCHIVED, name: 'Archived', status: 'ARCHIVED' as const },
    ],
  ]);

  it('dedupes proposals by vehicle id', () => {
    const result = dedupeHomeAssignmentProposals([
      { vehicleId: VEHICLE_1, desiredHomeStationId: STATION_A },
      { vehicleId: VEHICLE_1, desiredHomeStationId: STATION_B },
    ]);

    expect(result.proposals).toHaveLength(1);
    expect(result.duplicateVehicleIdsIgnored).toBe(1);
  });

  it('classifies add, remove, move, unchanged, and blocked actions', () => {
    const unchanged = evaluateHomeAssignmentPreviewItem({
      contextStationId: STATION_A,
      proposal: { vehicleId: VEHICLE_1, desiredHomeStationId: STATION_A },
      vehicle: {
        id: VEHICLE_1,
        licensePlate: 'M-AB 1',
        make: 'VW',
        model: 'Golf',
        homeStationId: STATION_A,
        currentStationId: STATION_A,
        expectedStationId: null,
        status: 'AVAILABLE',
      },
      stations,
    });
    expect(unchanged.action).toBe(HomeAssignmentPreviewAction.UNCHANGED);

    const add = evaluateHomeAssignmentPreviewItem({
      contextStationId: STATION_A,
      proposal: { vehicleId: VEHICLE_1, desiredHomeStationId: STATION_A },
      vehicle: {
        id: VEHICLE_1,
        licensePlate: 'M-AB 1',
        make: 'VW',
        model: 'Golf',
        homeStationId: null,
        currentStationId: null,
        expectedStationId: null,
        status: 'AVAILABLE',
      },
      stations,
    });
    expect(add.action).toBe(HomeAssignmentPreviewAction.ADD);
    expect(add.executableCommand).toBe(HomeAssignmentExecutableCommand.ADD);

    const remove = evaluateHomeAssignmentPreviewItem({
      contextStationId: STATION_A,
      proposal: { vehicleId: VEHICLE_1, desiredHomeStationId: null },
      vehicle: {
        id: VEHICLE_1,
        licensePlate: 'M-AB 1',
        make: 'VW',
        model: 'Golf',
        homeStationId: STATION_A,
        currentStationId: STATION_B,
        expectedStationId: STATION_A,
        status: 'RENTED',
      },
      stations,
    });
    expect(remove.action).toBe(HomeAssignmentPreviewAction.REMOVE);
    expect(remove.warnings.some((w) => w.code === HomeAssignmentPreviewIssueCode.VEHICLE_RENTED_HOME_CHANGE_WARNING)).toBe(true);
    expect(remove.activeTransfer).toEqual({
      fromStationId: STATION_B,
      toStationId: STATION_A,
      fromStationName: 'Station B',
      toStationName: 'Station A',
    });

    const move = evaluateHomeAssignmentPreviewItem({
      contextStationId: STATION_A,
      proposal: { vehicleId: VEHICLE_1, desiredHomeStationId: STATION_A },
      vehicle: {
        id: VEHICLE_1,
        licensePlate: 'M-AB 1',
        make: 'VW',
        model: 'Golf',
        homeStationId: STATION_B,
        currentStationId: STATION_B,
        expectedStationId: null,
        status: 'AVAILABLE',
      },
      stations,
    });
    expect(move.action).toBe(HomeAssignmentPreviewAction.MOVE);
    expect(move.executableCommand).toBe(HomeAssignmentExecutableCommand.MOVE);

    const blocked = evaluateHomeAssignmentPreviewItem({
      contextStationId: STATION_A,
      proposal: { vehicleId: VEHICLE_1, desiredHomeStationId: STATION_ARCHIVED },
      vehicle: {
        id: VEHICLE_1,
        licensePlate: 'M-AB 1',
        make: 'VW',
        model: 'Golf',
        homeStationId: null,
        currentStationId: null,
        expectedStationId: null,
        status: 'AVAILABLE',
      },
      stations,
    });
    expect(blocked.action).toBe(HomeAssignmentPreviewAction.BLOCKED);
    expect(blocked.conflicts[0]?.code).toBe(HomeAssignmentPreviewIssueCode.STATION_ARCHIVED);
  });

  it('summarizes mixed fleet buckets relative to context station', () => {
    const items = [
      evaluateHomeAssignmentPreviewItem({
        contextStationId: STATION_A,
        proposal: { vehicleId: 'add', desiredHomeStationId: STATION_A },
        vehicle: {
          id: 'add',
          licensePlate: 'A',
          make: null,
          model: null,
          homeStationId: null,
          currentStationId: null,
          expectedStationId: null,
          status: 'AVAILABLE',
        },
        stations,
      }),
      evaluateHomeAssignmentPreviewItem({
        contextStationId: STATION_A,
        proposal: { vehicleId: 'remove', desiredHomeStationId: null },
        vehicle: {
          id: 'remove',
          licensePlate: 'R',
          make: null,
          model: null,
          homeStationId: STATION_A,
          currentStationId: STATION_A,
          expectedStationId: null,
          status: 'AVAILABLE',
        },
        stations,
      }),
      evaluateHomeAssignmentPreviewItem({
        contextStationId: STATION_A,
        proposal: { vehicleId: 'move', desiredHomeStationId: STATION_B },
        vehicle: {
          id: 'move',
          licensePlate: 'M',
          make: null,
          model: null,
          homeStationId: STATION_A,
          currentStationId: STATION_A,
          expectedStationId: null,
          status: 'AVAILABLE',
        },
        stations,
      }),
    ];

    const summary = summarizeHomeAssignmentPreviewItems(STATION_A, items, 3, 3);
    expect(summary).toEqual({
      requested: 3,
      evaluated: 3,
      toAdd: 1,
      toRemove: 2,
      toMove: 0,
      unchanged: 0,
      blocked: 0,
    });
  });
});
