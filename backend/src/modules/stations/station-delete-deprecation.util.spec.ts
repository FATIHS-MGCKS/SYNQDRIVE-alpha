import { GoneException } from '@nestjs/common';
import { STATION_DELETE_DEPRECATED_CODE } from './station-delete-deprecation.constants';
import {
  buildStationDeleteDeprecatedResponse,
  throwStationDeleteDeprecated,
} from './station-delete-deprecation.util';

describe('station delete deprecation', () => {
  it('builds a structured deprecation payload', () => {
    const payload = buildStationDeleteDeprecatedResponse();

    expect(payload.statusCode).toBe(410);
    expect(payload.code).toBe(STATION_DELETE_DEPRECATED_CODE);
    expect(payload.replacement.command).toBe('ArchiveStation');
    expect(payload.replacement.method).toBe('POST');
    expect(payload.replacement.path).toContain('/archive');
  });

  it('throws GoneException with deprecation payload', () => {
    try {
      throwStationDeleteDeprecated();
      fail('expected GoneException');
    } catch (error) {
      expect(error).toBeInstanceOf(GoneException);
      expect((error as GoneException).getResponse()).toEqual(
        expect.objectContaining({
          code: STATION_DELETE_DEPRECATED_CODE,
          replacement: expect.objectContaining({ command: 'ArchiveStation' }),
        }),
      );
    }
  });
});
