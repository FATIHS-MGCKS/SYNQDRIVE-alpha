import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PartsProviderAdapter,
  ProductSearchRequest,
  ProductSearchResponse,
  ProductDetailResult,
  CheckoutSessionDescriptor,
  ProviderCapabilities,
  ProviderConnectionTestResult,
  DisclosureFieldSet,
  VehicleFitmentContext,
  NormalizedProductResult,
} from './provider-adapter.interface';

interface AlzuraMockTire {
  ean: string;
  brand: string;
  model: string;
  size: string;
  loadIndex: string;
  speedIndex: string;
  season: string;
  fuelEfficiency: string;
  wetGrip: string;
  noiseDb: number;
  priceNet: number;
  stock: number;
}

const MOCK_TIRE_CATALOG: AlzuraMockTire[] = [
  { ean: '4019238065787', brand: 'Continental', model: 'PremiumContact 7', size: '225/45 R17', loadIndex: '91', speedIndex: 'Y', season: 'summer', fuelEfficiency: 'A', wetGrip: 'A', noiseDb: 69, priceNet: 112.40, stock: 48 },
  { ean: '3528700929393', brand: 'Michelin', model: 'Pilot Sport 5', size: '225/45 R17', loadIndex: '94', speedIndex: 'Y', season: 'summer', fuelEfficiency: 'A', wetGrip: 'A', noiseDb: 70, priceNet: 128.90, stock: 32 },
  { ean: '8808563447513', brand: 'Hankook', model: 'Ventus S1 evo 3', size: '225/45 R17', loadIndex: '94', speedIndex: 'Y', season: 'summer', fuelEfficiency: 'A', wetGrip: 'A', noiseDb: 68, priceNet: 89.50, stock: 120 },
  { ean: '4024069001200', brand: 'Fulda', model: 'SportControl 2', size: '225/45 R17', loadIndex: '91', speedIndex: 'Y', season: 'summer', fuelEfficiency: 'C', wetGrip: 'A', noiseDb: 67, priceNet: 76.20, stock: 65 },
  { ean: '5452000811769', brand: 'Goodyear', model: 'Eagle F1 Asymmetric 6', size: '225/45 R17', loadIndex: '94', speedIndex: 'Y', season: 'summer', fuelEfficiency: 'A', wetGrip: 'A', noiseDb: 68, priceNet: 105.70, stock: 55 },
  { ean: '4019238034936', brand: 'Continental', model: 'WinterContact TS 870', size: '225/45 R17', loadIndex: '91', speedIndex: 'H', season: 'winter', fuelEfficiency: 'B', wetGrip: 'B', noiseDb: 71, priceNet: 118.60, stock: 28 },
  { ean: '3528701827698', brand: 'Michelin', model: 'Alpin 6', size: '225/45 R17', loadIndex: '94', speedIndex: 'V', season: 'winter', fuelEfficiency: 'C', wetGrip: 'B', noiseDb: 69, priceNet: 134.20, stock: 18 },
  { ean: '8808563579948', brand: 'Hankook', model: 'Winter i*cept RS3', size: '225/45 R17', loadIndex: '94', speedIndex: 'H', season: 'winter', fuelEfficiency: 'C', wetGrip: 'B', noiseDb: 72, priceNet: 82.30, stock: 90 },
  { ean: '4019238050134', brand: 'Continental', model: 'AllSeasonContact 2', size: '225/45 R17', loadIndex: '94', speedIndex: 'Y', season: 'allseason', fuelEfficiency: 'B', wetGrip: 'A', noiseDb: 70, priceNet: 122.50, stock: 41 },
  { ean: '3528704935291', brand: 'Michelin', model: 'CrossClimate 2', size: '225/45 R17', loadIndex: '94', speedIndex: 'Y', season: 'allseason', fuelEfficiency: 'A', wetGrip: 'A', noiseDb: 69, priceNet: 139.80, stock: 36 },
  { ean: '4024069583694', brand: 'Fulda', model: 'MultiControl', size: '225/45 R17', loadIndex: '94', speedIndex: 'V', season: 'allseason', fuelEfficiency: 'C', wetGrip: 'B', noiseDb: 71, priceNet: 72.90, stock: 73 },
  { ean: '8808563502038', brand: 'Hankook', model: 'Kinergy 4S2', size: '225/45 R17', loadIndex: '94', speedIndex: 'W', season: 'allseason', fuelEfficiency: 'C', wetGrip: 'B', noiseDb: 72, priceNet: 79.40, stock: 105 },
];

const VAT_RATE = 0.19;

@Injectable()
export class AlzuraAdapter implements PartsProviderAdapter {
  readonly providerKey = 'ALZURA';
  private readonly logger = new Logger(AlzuraAdapter.name);
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiBaseUrl =
      this.configService.get<string>('alzura.apiBaseUrl') ??
      'https://api.alzura.com/v1';
    this.apiKey = this.configService.get<string>('alzura.apiKey') ?? '';
  }

  async searchProducts(
    request: ProductSearchRequest,
  ): Promise<ProductSearchResponse> {
    const start = Date.now();
    const page = request.page ?? 1;
    const pageSize = request.pageSize ?? 20;

    // TODO: Replace mock with real ALZURA API call
    // const response = await axios.get(`${this.apiBaseUrl}/articles/search`, {
    //   headers: { 'X-Api-Key': this.apiKey },
    //   params: this.buildAlzuraSearchParams(request),
    // });

    let filtered = [...MOCK_TIRE_CATALOG];

    if (request.query) {
      const q = request.query.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.brand.toLowerCase().includes(q) ||
          t.model.toLowerCase().includes(q) ||
          t.size.includes(q) ||
          t.season.includes(q),
      );
    }

    if (request.filters?.season) {
      const season = Array.isArray(request.filters.season)
        ? request.filters.season
        : [request.filters.season];
      filtered = filtered.filter((t) => season.includes(t.season));
    }

    if (request.sortBy === 'price_asc') {
      filtered.sort((a, b) => a.priceNet - b.priceNet);
    } else if (request.sortBy === 'price_desc') {
      filtered.sort((a, b) => b.priceNet - a.priceNet);
    }

    const totalCount = filtered.length;
    const startIdx = (page - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    const results: NormalizedProductResult[] = pageItems.map((tire) =>
      this.mapTireToNormalized(tire, request.fitment),
    );

    return {
      results,
      totalCount,
      page,
      pageSize,
      hasMore: startIdx + pageSize < totalCount,
      searchDurationMs: Date.now() - start,
    };
  }

  async getProduct(
    externalId: string,
    fitment?: VehicleFitmentContext,
  ): Promise<ProductDetailResult | null> {
    // TODO: Replace with real ALZURA article detail API call
    const tire = MOCK_TIRE_CATALOG.find((t) => t.ean === externalId);
    if (!tire) return null;

    const base = this.mapTireToNormalized(tire, fitment);

    return {
      ...base,
      description: `${tire.brand} ${tire.model} – Hochleistungsreifen in ${tire.size}. EU-Label: Kraftstoffeffizienz ${tire.fuelEfficiency}, Nasshaftung ${tire.wetGrip}, Rollgeräusch ${tire.noiseDb} dB.`,
      specifications: {
        EAN: tire.ean,
        Größe: tire.size,
        Tragfähigkeitsindex: tire.loadIndex,
        Geschwindigkeitsindex: tire.speedIndex,
        Saison: tire.season,
        Kraftstoffeffizienz: tire.fuelEfficiency,
        Nasshaftung: tire.wetGrip,
        'Rollgeräusch (dB)': String(tire.noiseDb),
      },
      images: [
        `https://cdn.alzura.com/images/${tire.ean}_main.jpg`,
        `https://cdn.alzura.com/images/${tire.ean}_side.jpg`,
      ],
      checkoutUrl: `https://www.alzura.com/cart/add/${tire.ean}`,
      providerTermsNote:
        'Preise inkl. MwSt. zzgl. Versand. Angebote freibleibend.',
    };
  }

  async createCheckoutSession(
    items: { externalId: string; quantity: number }[],
    _fitment?: VehicleFitmentContext,
  ): Promise<CheckoutSessionDescriptor> {
    // TODO: Replace with real ALZURA embedded checkout session creation
    const itemParams = items
      .map((i) => `${i.externalId}:${i.quantity}`)
      .join(',');

    return {
      type: 'embedded',
      url: `https://checkout.alzura.com/session?items=${itemParams}`,
      sessionId: `alz_sess_${Date.now()}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsEmbeddedSearch: true,
      supportsEmbeddedProductDetails: true,
      supportsEmbeddedCart: true,
      supportsEmbeddedCheckout: true,
      supportsRedirectCheckout: false,
      supportsVehicleFitment: true,
      supportsTireSearch: true,
      supportsPartsSearch: true,
      supportsAccessoriesSearch: false,
    };
  }

  getDisclosureFields(category: string): DisclosureFieldSet {
    if (category === 'TIRES') {
      return {
        fields: [
          'fuelEfficiency',
          'wetGrip',
          'noiseDb',
          'noiseClass',
          'season',
        ],
        descriptions: {
          fuelEfficiency:
            'EU-Reifenlabel Kraftstoffeffizienz (A–E)',
          wetGrip: 'EU-Reifenlabel Nasshaftung (A–E)',
          noiseDb: 'Externes Rollgeräusch in Dezibel',
          noiseClass: 'Geräuschklasse (A–C)',
          season:
            'Saisoneignung: Sommer, Winter oder Ganzjahres',
        },
      };
    }

    return {
      fields: ['brand', 'oemNumber'],
      descriptions: {
        brand: 'Hersteller / Marke',
        oemNumber: 'OEM-Teilenummer',
      },
    };
  }

  async testConnection(): Promise<ProviderConnectionTestResult> {
    const start = Date.now();
    try {
      // TODO: Replace with real ALZURA health/ping endpoint
      // await axios.get(`${this.apiBaseUrl}/health`, {
      //   headers: { 'X-Api-Key': this.apiKey },
      //   timeout: 5000,
      // });

      this.logger.log('ALZURA connection test (mock): OK');
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: 'Mock connection OK – replace with live API ping',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      };
    }
  }

  private mapTireToNormalized(
    tire: AlzuraMockTire,
    fitment?: VehicleFitmentContext,
  ): NormalizedProductResult {
    const gross = +(tire.priceNet * (1 + VAT_RATE)).toFixed(2);
    const { fitmentStatus, fitmentConfidence, fitmentNotes } =
      this.assessFitment(tire, fitment);

    return {
      id: `alzura_${tire.ean}`,
      externalId: tire.ean,
      providerKey: this.providerKey,
      category: 'TIRES',
      title: `${tire.brand} ${tire.model}`,
      subtitle: `${tire.size} ${tire.loadIndex}${tire.speedIndex} – ${this.seasonLabel(tire.season)}`,
      brand: tire.brand,
      imageUrl: `https://cdn.alzura.com/images/${tire.ean}_thumb.jpg`,
      priceNet: tire.priceNet,
      priceGross: gross,
      currency: 'EUR',
      availabilityStatus:
        tire.stock > 20 ? 'in_stock' : tire.stock > 0 ? 'limited' : 'out_of_stock',
      shippingInfo: 'Versand innerhalb 2–4 Werktage',
      deliveryDays: tire.stock > 20 ? 2 : 4,
      fitmentStatus,
      fitmentConfidence,
      fitmentNotes,
      sellerName: 'ALZURA Tyre24',
      marketplaceName: 'ALZURA',
      productUrl: `https://www.alzura.com/article/${tire.ean}`,
      rating: +(3.8 + Math.random() * 1.2).toFixed(1),
      reviewCount: Math.floor(10 + Math.random() * 250),
      rawAttributesJson: {
        fuelEfficiency: tire.fuelEfficiency,
        wetGrip: tire.wetGrip,
        noiseDb: tire.noiseDb,
        season: tire.season,
        loadIndex: tire.loadIndex,
        speedIndex: tire.speedIndex,
      },
    };
  }

  private assessFitment(
    tire: AlzuraMockTire,
    fitment?: VehicleFitmentContext,
  ): {
    fitmentStatus: NormalizedProductResult['fitmentStatus'];
    fitmentConfidence: number;
    fitmentNotes?: string;
  } {
    if (!fitment) {
      return { fitmentStatus: 'unknown', fitmentConfidence: 0 };
    }

    const specMatches =
      (fitment.tireFrontSpec && tire.size === fitment.tireFrontSpec) ||
      (fitment.tireRearSpec && tire.size === fitment.tireRearSpec);

    if (specMatches) {
      return {
        fitmentStatus: 'exact_fit',
        fitmentConfidence: 95,
        fitmentNotes: `Passt zu ${fitment.make} ${fitment.model} (${fitment.year})`,
      };
    }

    return {
      fitmentStatus: 'likely_fit',
      fitmentConfidence: 60,
      fitmentNotes: `Größe ${tire.size} – Fahrzeugfreigabe prüfen für ${fitment.make} ${fitment.model}`,
    };
  }

  private seasonLabel(season: string): string {
    const labels: Record<string, string> = {
      summer: 'Sommerreifen',
      winter: 'Winterreifen',
      allseason: 'Ganzjahresreifen',
    };
    return labels[season] ?? season;
  }
}
