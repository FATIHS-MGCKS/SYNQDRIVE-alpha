import { buildAdminBaselineDraftFromMasterInput, buildTechnicalBaselineDraftFromMasterManualSpecs } from '../master-dimo-registration.mapper';

describe('master-dimo-registration.mapper', () => {
  it('maps admin baseline from Master extraData and stationId', () => {
    const draft = buildAdminBaselineDraftFromMasterInput({
      organizationId: 'org-1',
      stationId: 'station-1',
      dimoVehicleId: 'dimo-1',
      extraData: {
        vehicleName: 'Fleet 1',
        licensePlate: 'B-XY 1',
        notes: 'note',
      },
      actorUserId: null,
    });
    expect(draft.vehicleName).toBe('Fleet 1');
    expect(draft.licensePlate).toBe('B-XY 1');
    expect(draft.stationId).toBe('station-1');
    expect(draft.notes).toBe('note');
  });

  it('maps brake manual specs into technical baseline v2', () => {
    const draft = buildTechnicalBaselineDraftFromMasterManualSpecs({
      organizationId: 'org-1',
      stationId: null,
      dimoVehicleId: 'dimo-1',
      manualSpecs: {
        brakes: { frontPadThickness: 10, rearPadThickness: 9 },
      },
      actorUserId: null,
    });
    expect(draft.brakeReference?.frontPadNominalThicknessMm).toBe(10);
    expect(draft.brakeReference?.rearPadNominalThicknessMm).toBe(9);
  });
});
