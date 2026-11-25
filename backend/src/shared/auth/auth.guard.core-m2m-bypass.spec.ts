import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CORE_APP_M2M_SKIP_USER_JWT_KEY } from '@modules/core-app-m2m/core-app-m2m-skip-user-jwt.decorator';
import { AuthGuard } from './auth.guard';
import { UserAccessAuthorityService } from './user-access-authority.service';

describe('AuthGuard — Core M2M user-JWT bypass', () => {
  const envBackup = { ...process.env };
  let guard: AuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    process.env.JWT_SECRET = 'guard-bypass-test-secret';
    reflector = new Reflector();
    const accessAuthority = {
      validateAccessJwt: jest.fn(),
    } as unknown as UserAccessAuthorityService;
    guard = new AuthGuard(reflector, accessAuthority);
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  function contextFor(path: string, skipUserJwt: boolean): ExecutionContext {
    const handler = skipUserJwt ? () => undefined : () => undefined;
    const controllerClass = skipUserJwt
      ? class Marked {
          static skip = true;
        }
      : class Plain {};

    if (skipUserJwt) {
      Reflect.defineMetadata(CORE_APP_M2M_SKIP_USER_JWT_KEY, true, controllerClass);
    }

    return {
      switchToHttp: () => ({
        getRequest: () => ({ url: path, path, headers: {} }),
      }),
      getHandler: () => handler,
      getClass: () => controllerClass,
    } as unknown as ExecutionContext;
  }

  it('allows undecorated routes with prefix collision to fail closed without user JWT', async () => {
    await expect(
      guard.canActivate(contextFor('/api/v1/core/read/v1-not-a-route', false)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(contextFor('/api/v1/core/read/v1extra/organizations/x/vehicles', false)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('skips user JWT only when handler metadata marks Core M2M skip', async () => {
    await expect(
      guard.canActivate(
        contextFor('/api/v1/core/read/v1/organizations/org/vehicles', true),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        contextFor('/api/v1/core/read/v1/organizations/org/vehicles', false),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});