import { SetMetadata } from '@nestjs/common';
import { PRODUCT_KEY } from '../guards/product-license.guard';

export const RequireProduct = (productSlug: string) => SetMetadata(PRODUCT_KEY, productSlug);
