import { IsOptional, IsUrl } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsOptional()
  @IsUrl({ require_protocol: true })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  cancelUrl?: string;
}
