import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokeDataAuthorizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
