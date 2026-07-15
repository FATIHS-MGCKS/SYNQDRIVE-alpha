import { SetMetadata } from '@nestjs/common';

export const MASTER_BILLING_KEY = 'masterBilling';

/** Routes callable only by platform master admin or users with `master-billing` platform permission. */
export const RequireMasterBilling = () => SetMetadata(MASTER_BILLING_KEY, true);

export const MASTER_BILLING_PLATFORM_PERMISSION = 'master-billing' as const;
