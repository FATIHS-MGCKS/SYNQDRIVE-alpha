import { registerAs } from '@nestjs/config';

export default registerAs('billingStripeSync', () => ({
  lifecycleEnabled: process.env.BILLING_STRIPE_SYNC_ON_LIFECYCLE_ENABLED !== 'false',
}));
