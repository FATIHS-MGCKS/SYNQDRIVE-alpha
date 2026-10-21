import { Equals, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReturnPhysicalDeviceToStockDto {
  @IsString()
  @MaxLength(256)
  warehouseLocation!: string;

  @IsBoolean()
  @Equals(true, { message: 'physicalReturnConfirmed must be true' })
  physicalReturnConfirmed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  returnNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
