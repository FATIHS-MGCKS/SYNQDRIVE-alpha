import { SetMetadata } from '@nestjs/common';

/** When true on a controller/handler, global user `AuthGuard` skips user JWT (M2M guard enforces). */
export const CORE_APP_M2M_SKIP_USER_JWT_KEY = 'coreAppM2mSkipUserJwt';

export const CoreAppM2mSkipUserJwt = () => SetMetadata(CORE_APP_M2M_SKIP_USER_JWT_KEY, true);