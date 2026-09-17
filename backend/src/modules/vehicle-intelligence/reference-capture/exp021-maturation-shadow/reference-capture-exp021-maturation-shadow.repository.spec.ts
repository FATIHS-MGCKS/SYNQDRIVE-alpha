import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import {
  EXP021_MATURATION_SHADOW_ENABLED_DEFAULT,
  defaultExp021MaturationShadowConfig,
} from './reference-capture-exp021-maturation-shadow.types';

describe('EXP-021 maturation shadow repository contract', () => {
  it('defaults shadow config to disabled', () => {
    expect(EXP021_MATURATION_SHADOW_ENABLED_DEFAULT).toBe(false);
    expect(defaultExp021MaturationShadowConfig().enabled).toBe(false);
  });

  it('rejects attempt updates at repository boundary', async () => {
    const repository = new ReferenceCaptureExp021MaturationShadowRepository({} as never);
    await expect(repository.updateObservationAttempt()).rejects.toThrow(/immutable/i);
  });
});
