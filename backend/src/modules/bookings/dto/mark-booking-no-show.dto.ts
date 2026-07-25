import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkBookingNoShowDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}
