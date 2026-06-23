import { IsOptional, IsString } from 'class-validator';

export class ConnectWhatsAppDto {
  @IsString()
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  connectedByName?: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  wabaId?: string;
}
