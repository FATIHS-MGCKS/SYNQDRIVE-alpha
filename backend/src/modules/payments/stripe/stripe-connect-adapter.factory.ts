import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STRIPE_CONNECT_ADAPTER, type StripeConnectAdapter } from './stripe-connect.adapter';
import { StripeConnectV1Adapter } from './stripe-connect-v1.adapter';
import { StripeConnectV2Adapter } from './stripe-connect-v2.adapter';

@Injectable()
export class StripeConnectAdapterFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly v1Adapter: StripeConnectV1Adapter,
    private readonly v2Adapter: StripeConnectV2Adapter,
  ) {}

  resolve(): StripeConnectAdapter {
    const generation = (
      this.configService.get<string>('stripe.connectAccountGeneration') ?? 'V1'
    ).toUpperCase();
    return generation === 'V2' ? this.v2Adapter : this.v1Adapter;
  }
}

export const stripeConnectAdapterProvider = {
  provide: STRIPE_CONNECT_ADAPTER,
  useFactory: (factory: StripeConnectAdapterFactory) => factory.resolve(),
  inject: [StripeConnectAdapterFactory],
};
