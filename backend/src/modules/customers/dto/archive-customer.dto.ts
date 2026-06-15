import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ArchiveCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
