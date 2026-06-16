import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GrantDataAuthorizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
