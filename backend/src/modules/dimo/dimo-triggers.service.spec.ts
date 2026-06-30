import axios from 'axios';
import { DimoTriggersService } from './dimo-triggers.service';
import { DimoAuthService } from './dimo-auth.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DimoTriggersService', () => {
  let service: DimoTriggersService;
  let auth: { getDeveloperJwt: jest.Mock };

  beforeEach(() => {
    auth = { getDeveloperJwt: jest.fn().mockResolvedValue('jwt') };
    service = new DimoTriggersService(
      { dimoEnv: 'production', webhookBaseUrl: 'https://app.synqdrive.eu' } as any,
      auth as unknown as DimoAuthService,
    );
    jest.clearAllMocks();
  });

  it('never subscribes RPM/engine signals', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true } });

    await service.subscribeVehicle('wh_1', 99, [
      'powertrainCombustionEngineSpeed',
      'throttle',
      'engineLoad',
    ]);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('filters blocked engine signals and subscribes allowed ones', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true } });

    await service.subscribeVehicle('wh_1', 99, ['obdIsPluggedIn', 'powertrainCombustionEngineSpeed']);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://vehicle-triggers-api.dimo.zone/v1/webhooks/wh_1/vehicles/99',
      { signals: ['obdIsPluggedIn'] },
      expect.objectContaining({ headers: { Authorization: 'Bearer jwt' } }),
    );
  });

  it('registerAllTriggersForVehicle does not include RPM signals', async () => {
    const subscribeSpy = jest.spyOn(service, 'subscribeVehicle').mockResolvedValue({});

    await service.registerAllTriggersForVehicle('wh_1', 7);

    expect(subscribeSpy).toHaveBeenCalledWith('wh_1', 7, [
      'obdDTCList',
      'speed',
      'isIgnitionOn',
      'obdIsPluggedIn',
    ]);
  });
});
