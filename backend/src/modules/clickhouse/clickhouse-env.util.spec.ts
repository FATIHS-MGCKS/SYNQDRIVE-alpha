import { isHfMirrorEnabled, resolveHfMirrorFlagStatus } from './clickhouse-env.util';

describe('clickhouse-env.util', () => {
  const original = process.env.HF_MIRROR_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.HF_MIRROR_ENABLED;
    else process.env.HF_MIRROR_ENABLED = original;
  });

  it('defaults HF mirror to disabled', () => {
    delete process.env.HF_MIRROR_ENABLED;
    expect(isHfMirrorEnabled()).toBe(false);
    expect(resolveHfMirrorFlagStatus()).toBe('disabled');
  });
});
