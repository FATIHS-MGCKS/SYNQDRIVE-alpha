import { IsBoolean, IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateBookingPaymentRequestDto {
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(60 * 60 * 24 * 30)
  expiresIn?: number;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
