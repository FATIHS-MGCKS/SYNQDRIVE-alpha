import { registerAs } from '@nestjs/config';

export default registerAs('billingReconciliation', () => ({
  schedulerEnabled: process.env.BILLING_RECONCILIATION_SCHEDULER_ENABLED !== 'false',
}));
