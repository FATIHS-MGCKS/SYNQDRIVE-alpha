export interface VehicleFitmentContext {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  trim?: string;
  engineType?: string;
  fuelType?: string;
  bodyType?: string;
  vin?: string;
  tireFrontSpec?: string;
  tireRearSpec?: string;
  driveType?: string;
  curbWeightKg?: number;
}

export interface ProductSearchRequest {
  fitment: VehicleFitmentContext;
  category: 'TIRES' | 'PARTS' | 'ACCESSORIES';
  query?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'relevance' | 'rating';
  filters?: Record<string, string | string[]>;
}

export interface NormalizedProductResult {
  id: string;
  externalId: string;
  providerKey: string;
  category: string;
  title: string;
  subtitle?: string;
  brand?: string;
  imageUrl?: string;
  priceNet?: number;
  priceGross?: number;
  currency: string;
  availabilityStatus: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  shippingInfo?: string;
  deliveryDays?: number;
  fitmentStatus: 'exact_fit' | 'likely_fit' | 'universal' | 'unknown';
  fitmentConfidence: number;
  fitmentNotes?: string;
  sellerName?: string;
  marketplaceName?: string;
  productUrl?: string;
  rating?: number;
  reviewCount?: number;
  rawAttributesJson?: Record<string, unknown>;
}

export interface ProductSearchResponse {
  results: NormalizedProductResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  searchDurationMs: number;
}

export interface ProductDetailResult extends NormalizedProductResult {
  description?: string;
  specifications?: Record<string, string>;
  images?: string[];
  checkoutUrl?: string;
  providerTermsNote?: string;
}

export interface CheckoutSessionDescriptor {
  type: 'embedded' | 'redirect' | 'external';
  url?: string;
  sessionId?: string;
  expiresAt?: string;
}

export interface ProviderCapabilities {
  supportsEmbeddedSearch: boolean;
  supportsEmbeddedProductDetails: boolean;
  supportsEmbeddedCart: boolean;
  supportsEmbeddedCheckout: boolean;
  supportsRedirectCheckout: boolean;
  supportsVehicleFitment: boolean;
  supportsTireSearch: boolean;
  supportsPartsSearch: boolean;
  supportsAccessoriesSearch: boolean;
}

export interface ProviderConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message?: string;
  timestamp: Date;
}

export interface DisclosureFieldSet {
  fields: string[];
  descriptions: Record<string, string>;
}

export interface PartsProviderAdapter {
  readonly providerKey: string;

  searchProducts(
    request: ProductSearchRequest,
  ): Promise<ProductSearchResponse>;

  getProduct(
    externalId: string,
    fitment?: VehicleFitmentContext,
  ): Promise<ProductDetailResult | null>;

  createCheckoutSession?(
    items: { externalId: string; quantity: number }[],
    fitment?: VehicleFitmentContext,
  ): Promise<CheckoutSessionDescriptor>;

  getCapabilities(): ProviderCapabilities;

  getDisclosureFields(category: string): DisclosureFieldSet;

  testConnection(): Promise<ProviderConnectionTestResult>;
}
