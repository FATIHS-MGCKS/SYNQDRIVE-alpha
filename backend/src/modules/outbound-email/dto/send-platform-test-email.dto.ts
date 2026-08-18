import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendPlatformTestEmailDto {
  @IsEmail()
  @MaxLength(320)
  toEmail!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
