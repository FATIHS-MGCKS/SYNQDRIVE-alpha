import { PartialType } from '@nestjs/swagger';
import { CreateVendorDto } from './create-vendor.dto';

/**
 * Update vendor master data only. Every field is optional.
 * Vehicle links are intentionally NOT part of this payload — see CreateVendorDto.
 */
export class UpdateVendorDto extends PartialType(CreateVendorDto) {}
