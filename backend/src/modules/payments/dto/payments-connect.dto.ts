import { IsOptional, IsString, IsUrl } from 'class-validator';

export class ConnectOnboardingLinkDto {
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true }, { message: 'returnUrl must be a valid URL' })
  returnUrl?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true }, { message: 'refreshUrl must be a valid URL' })
  refreshUrl?: string;
}
