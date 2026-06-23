import { IsOptional, IsString } from 'class-validator';

export class SimulateIncomingDto {
  @IsString()
  contactPhone!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsString()
  content!: string;
}
