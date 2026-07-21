import { IsString, MinLength, IsUUID } from 'class-validator';

export class SwitchOrganizationDto {
  @IsUUID('4', { message: 'organizationId must be a valid UUID' })
  organizationId: string;

  @IsString()
  @MinLength(1, { message: 'refreshToken is required' })
  refreshToken: string;
}
