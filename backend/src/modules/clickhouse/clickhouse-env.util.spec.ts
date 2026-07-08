import { isHfMirrorEnabled, resolveHfMirrorFlagStatus } from './clickhouse-env.util';

describe('clickhouse-env.util — HF_MIRROR_ENABLED', () => {
  const original = process.env.HF_MIRROR_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.HF_MIRROR_ENABLED;
    else process.env.HF_MIRROR_ENABLED = original;
  });

  it('defaults to disabled when env is missing', () => {
    delete process.env.HF_MIRROR_ENABLED;
    expect(isHfMirrorEnabled()).toBe(false);
    expect(resolveHfMirrorFlagStatus()).toBe('disabled');
  });

  it('enables only on explicit true', () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    expect(isHfMirrorEnabled()).toBe(true);
    expect(resolveHfMirrorFlagStatus()).toBe('enabled');
  });

  it('treats false and empty as disabled', () => {
    process.env.HF_MIRROR_ENABLED = 'false';
    expect(isHfMirrorEnabled()).toBe(false);
    process.env.HF_MIRROR_ENABLED = '';
    expect(isHfMirrorEnabled()).toBe(false);
  });
});
