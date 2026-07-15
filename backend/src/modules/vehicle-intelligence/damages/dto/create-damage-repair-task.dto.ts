import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDamageRepairTaskDto {
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
