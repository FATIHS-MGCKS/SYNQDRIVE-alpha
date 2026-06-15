import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddCustomerNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  note!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
