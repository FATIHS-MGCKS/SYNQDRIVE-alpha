import { runLongitudinalProfileMaterializeOps } from './longitudinal-profile-materialization.ops-runner';

describe('longitudinal-profile-materialization.ops-runner', () => {
  it('P — flag OFF path delegates to runtime facade', async () => {
    const materialize = jest.fn().mockResolvedValue({ status: 'SKIPPED_FLAG_OFF' });
    const result = await runLongitudinalProfileMaterializeOps(
      { materialize },
      { organizationId: 'org-1', vehicleId: 'veh-1' },
    );
    expect(result).toEqual({ status: 'SKIPPED_FLAG_OFF' });
    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it('requires explicit org + vehicle', async () => {
    const materialize = jest.fn();
    const result = await runLongitudinalProfileMaterializeOps({ materialize }, {
      organizationId: '',
      vehicleId: 'veh-1',
    });
    expect(result).toMatchObject({ status: 'INVALID_ARGS' });
    expect(materialize).not.toHaveBeenCalled();
  });

  it('rejects fractional programmatic override with INVALID_ARGS', async () => {
    const materialize = jest.fn();
    const result = await runLongitudinalProfileMaterializeOps(
      { materialize },
      { organizationId: 'org-1', vehicleId: 'veh-1', sessionLimitOverride: 1.5 },
    );
    expect(result).toMatchObject({ status: 'INVALID_ARGS' });
    expect(materialize).not.toHaveBeenCalled();
  });
});
