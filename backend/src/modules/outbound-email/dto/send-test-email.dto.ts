import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendTestEmailDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  bodyText?: string;
}
