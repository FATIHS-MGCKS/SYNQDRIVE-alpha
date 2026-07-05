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

  it('filters throttle/engineLoad but allows RPM subscription', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true } });

    await service.subscribeVehicle('wh_1', 99, [
      'throttle',
      'engineLoad',
    ]);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('filters blocked throttle signals and subscribes allowed ones including RPM', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true } });

    await service.subscribeVehicle('wh_1', 99, ['obdIsPluggedIn', 'powertrainCombustionEngineSpeed', 'throttle']);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://vehicle-triggers-api.dimo.zone/v1/webhooks/wh_1/vehicles/99',
      { signals: ['obdIsPluggedIn', 'powertrainCombustionEngineSpeed'] },
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
