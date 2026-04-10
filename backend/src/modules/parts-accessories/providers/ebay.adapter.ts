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

interface EbayMockListing {
  itemId: string;
  title: string;
  category: 'TIRES' | 'PARTS' | 'ACCESSORIES';
  brand: string;
  priceAmount: number;
  currency: 'EUR' | 'USD';
  condition: 'new' | 'refurbished' | 'used';
  seller: string;
  sellerRating: number;
  imageUrl: string;
  freeShipping: boolean;
  location: string;
  watchers: number;
  soldCount: number;
}

const MOCK_LISTINGS: EbayMockListing[] = [
  { itemId: 'ebay_394827163541', title: 'Bosch Aerotwin Scheibenwischer Set A979S 600/475mm', category: 'ACCESSORIES', brand: 'Bosch', priceAmount: 24.95, currency: 'EUR', condition: 'new', seller: 'autoteile24_de', sellerRating: 99.4, imageUrl: 'https://i.ebayimg.com/images/g/wiper_bosch_a979s.jpg', freeShipping: true, location: 'Berlin, DE', watchers: 87, soldCount: 1420 },
  { itemId: 'ebay_275938412076', title: 'Mann Filter Ölfilter HU 719/7 x für VW Audi Seat Skoda', category: 'PARTS', brand: 'Mann-Filter', priceAmount: 8.49, currency: 'EUR', condition: 'new', seller: 'kfzteile_profi', sellerRating: 99.7, imageUrl: 'https://i.ebayimg.com/images/g/oilfilter_mann_hu719.jpg', freeShipping: true, location: 'Hamburg, DE', watchers: 142, soldCount: 5830 },
  { itemId: 'ebay_185493726281', title: 'Continental WinterContact TS 870 225/45 R17 91H Winterreifen', category: 'TIRES', brand: 'Continental', priceAmount: 109.90, currency: 'EUR', condition: 'new', seller: 'reifen_direkt_eu', sellerRating: 98.9, imageUrl: 'https://i.ebayimg.com/images/g/conti_ts870_225_45.jpg', freeShipping: false, location: 'Hannover, DE', watchers: 34, soldCount: 290 },
  { itemId: 'ebay_334829571034', title: 'LED Innenraumbeleuchtung Set 12-tlg Weiß für BMW 3er E90 E91', category: 'ACCESSORIES', brand: 'Osram', priceAmount: 18.99, currency: 'EUR', condition: 'new', seller: 'led_car_parts', sellerRating: 98.2, imageUrl: 'https://i.ebayimg.com/images/g/led_interior_bmw_e90.jpg', freeShipping: true, location: 'München, DE', watchers: 63, soldCount: 830 },
  { itemId: 'ebay_204517839265', title: 'Brembo Bremsscheiben + Beläge vorne für VW Golf 7 GTI', category: 'PARTS', brand: 'Brembo', priceAmount: 142.50, currency: 'EUR', condition: 'new', seller: 'bremsen_discount', sellerRating: 99.1, imageUrl: 'https://i.ebayimg.com/images/g/brembo_golf7_front.jpg', freeShipping: true, location: 'Köln, DE', watchers: 58, soldCount: 472 },
  { itemId: 'ebay_165382941087', title: 'Thule WingBar Evo Dachträger Grundträger 7112 für BMW 3er F30', category: 'ACCESSORIES', brand: 'Thule', priceAmount: 189.00, currency: 'EUR', condition: 'new', seller: 'dachbox_outlet', sellerRating: 97.8, imageUrl: 'https://i.ebayimg.com/images/g/thule_wingbar_f30.jpg', freeShipping: true, location: 'Stuttgart, DE', watchers: 29, soldCount: 165 },
  { itemId: 'ebay_284739105826', title: 'WeatherTech Fußmatten Set Gummi für Tesla Model 3 2020–2024', category: 'ACCESSORIES', brand: 'WeatherTech', priceAmount: 134.99, currency: 'USD', condition: 'new', seller: 'weathertech_official', sellerRating: 99.6, imageUrl: 'https://i.ebayimg.com/images/g/wt_floormat_model3.jpg', freeShipping: false, location: 'Delphos, OH, US', watchers: 215, soldCount: 3800 },
  { itemId: 'ebay_353917482630', title: 'Denso Iridium Zündkerzen IK20TT 4 Stück – VW Audi 1.8T 2.0T', category: 'PARTS', brand: 'Denso', priceAmount: 28.40, currency: 'EUR', condition: 'new', seller: 'spark_store_eu', sellerRating: 98.5, imageUrl: 'https://i.ebayimg.com/images/g/denso_ik20tt_set4.jpg', freeShipping: true, location: 'Frankfurt, DE', watchers: 71, soldCount: 1950 },
  { itemId: 'ebay_195028374612', title: 'Michelin CrossClimate 2 225/45 R17 94Y XL Ganzjahresreifen', category: 'TIRES', brand: 'Michelin', priceAmount: 132.40, currency: 'EUR', condition: 'new', seller: 'reifen_peters', sellerRating: 99.0, imageUrl: 'https://i.ebayimg.com/images/g/michelin_cc2_225_45.jpg', freeShipping: false, location: 'Düsseldorf, DE', watchers: 46, soldCount: 512 },
  { itemId: 'ebay_223841957023', title: 'OLED Rückleuchten Set Smoke für BMW 3er F30 LCI Style', category: 'ACCESSORIES', brand: 'Depo', priceAmount: 289.00, currency: 'EUR', condition: 'new', seller: 'tuning_freaks_de', sellerRating: 97.3, imageUrl: 'https://i.ebayimg.com/images/g/oled_tail_f30_smoke.jpg', freeShipping: true, location: 'Essen, DE', watchers: 112, soldCount: 94 },
];

@Injectable()
export class EbayAdapter implements PartsProviderAdapter {
  readonly providerKey = 'EBAY';
  private readonly logger = new Logger(EbayAdapter.name);
  private readonly appId: string;
  private readonly certId: string;
  private readonly affiliateId: string;

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('ebay.appId') ?? '';
    this.certId = this.configService.get<string>('ebay.certId') ?? '';
    this.affiliateId =
      this.configService.get<string>('ebay.affiliateId') ?? '';
  }

  async searchProducts(
    request: ProductSearchRequest,
  ): Promise<ProductSearchResponse> {
    const start = Date.now();
    const page = request.page ?? 1;
    const pageSize = request.pageSize ?? 20;

    // TODO: Replace mock with real eBay Browse API / Finding API call
    // const token = await this.getOAuthToken();
    // const response = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
    //   headers: { Authorization: `Bearer ${token}` },
    //   params: { q: this.buildEbayQuery(request), limit: pageSize, offset: (page - 1) * pageSize },
    // });

    let filtered = [...MOCK_LISTINGS];

    if (request.category) {
      filtered = filtered.filter((l) => l.category === request.category);
    }

    if (request.query) {
      const q = request.query.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.brand.toLowerCase().includes(q),
      );
    }

    if (request.sortBy === 'price_asc') {
      filtered.sort((a, b) => a.priceAmount - b.priceAmount);
    } else if (request.sortBy === 'price_desc') {
      filtered.sort((a, b) => b.priceAmount - a.priceAmount);
    } else if (request.sortBy === 'rating') {
      filtered.sort((a, b) => b.sellerRating - a.sellerRating);
    }

    const totalCount = filtered.length;
    const startIdx = (page - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    const results: NormalizedProductResult[] = pageItems.map((listing) =>
      this.mapListingToNormalized(listing, request.fitment),
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
    // TODO: Replace with real eBay Browse API item detail call
    const listing = MOCK_LISTINGS.find((l) => l.itemId === externalId);
    if (!listing) return null;

    const base = this.mapListingToNormalized(listing, fitment);

    return {
      ...base,
      description: `${listing.title}. Zustand: ${this.conditionLabel(listing.condition)}. Verkäufer: ${listing.seller} (${listing.sellerRating}% positiv). Standort: ${listing.location}.`,
      specifications: {
        Zustand: this.conditionLabel(listing.condition),
        Marke: listing.brand,
        Standort: listing.location,
        'Verkaufte Stück': String(listing.soldCount),
      },
      images: [listing.imageUrl],
      checkoutUrl: `https://www.ebay.de/itm/${listing.itemId.replace('ebay_', '')}`,
      providerTermsNote:
        'Kauf über eBay-Marktplatz. Es gelten die AGB und Käuferschutz-Richtlinien von eBay.',
    };
  }

  async createCheckoutSession(
    items: { externalId: string; quantity: number }[],
    _fitment?: VehicleFitmentContext,
  ): Promise<CheckoutSessionDescriptor> {
    // eBay uses redirect-based checkout; no embedded session possible
    const firstItem = items[0];
    const numericId = firstItem
      ? firstItem.externalId.replace('ebay_', '')
      : '';

    return {
      type: 'redirect',
      url: `https://www.ebay.de/itm/${numericId}`,
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsEmbeddedSearch: false,
      supportsEmbeddedProductDetails: false,
      supportsEmbeddedCart: false,
      supportsEmbeddedCheckout: false,
      supportsRedirectCheckout: true,
      supportsVehicleFitment: false,
      supportsTireSearch: true,
      supportsPartsSearch: true,
      supportsAccessoriesSearch: true,
    };
  }

  getDisclosureFields(category: string): DisclosureFieldSet {
    if (category === 'TIRES') {
      return {
        fields: ['condition', 'seller', 'location'],
        descriptions: {
          condition: 'Artikelzustand (Neu, Generalüberholt, Gebraucht)',
          seller: 'eBay-Verkäufer und Bewertung',
          location: 'Standort des Verkäufers',
        },
      };
    }

    return {
      fields: ['condition', 'seller', 'location', 'returnPolicy'],
      descriptions: {
        condition: 'Artikelzustand',
        seller: 'eBay-Verkäufer und Bewertung',
        location: 'Standort des Verkäufers',
        returnPolicy: 'Rückgabebedingungen des Verkäufers',
      },
    };
  }

  async testConnection(): Promise<ProviderConnectionTestResult> {
    const start = Date.now();
    try {
      // TODO: Replace with real eBay OAuth token validation or API ping
      // const token = await this.getOAuthToken();
      // await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search?q=test&limit=1', {
      //   headers: { Authorization: `Bearer ${token}` },
      // });

      this.logger.log('eBay connection test (mock): OK');
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: 'Mock connection OK – replace with live eBay OAuth ping',
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

  private mapListingToNormalized(
    listing: EbayMockListing,
    fitment?: VehicleFitmentContext,
  ): NormalizedProductResult {
    const { fitmentStatus, fitmentConfidence, fitmentNotes } =
      this.assessFitment(listing, fitment);

    return {
      id: listing.itemId,
      externalId: listing.itemId,
      providerKey: this.providerKey,
      category: listing.category,
      title: listing.title,
      brand: listing.brand,
      imageUrl: listing.imageUrl,
      priceGross: listing.priceAmount,
      currency: listing.currency,
      availabilityStatus: listing.soldCount > 100 ? 'in_stock' : 'limited',
      shippingInfo: listing.freeShipping
        ? 'Kostenloser Versand'
        : 'Versandkosten beim Verkäufer prüfen',
      deliveryDays: listing.location.includes('DE') ? 3 : 7,
      fitmentStatus,
      fitmentConfidence,
      fitmentNotes,
      sellerName: listing.seller,
      marketplaceName: 'eBay',
      productUrl: `https://www.ebay.de/itm/${listing.itemId.replace('ebay_', '')}`,
      rating: +(listing.sellerRating / 20).toFixed(1),
      reviewCount: listing.soldCount,
      rawAttributesJson: {
        condition: listing.condition,
        sellerRating: listing.sellerRating,
        watchers: listing.watchers,
        soldCount: listing.soldCount,
        location: listing.location,
      },
    };
  }

  private assessFitment(
    listing: EbayMockListing,
    fitment?: VehicleFitmentContext,
  ): {
    fitmentStatus: NormalizedProductResult['fitmentStatus'];
    fitmentConfidence: number;
    fitmentNotes?: string;
  } {
    if (!fitment) {
      return { fitmentStatus: 'unknown', fitmentConfidence: 0 };
    }

    const titleLower = listing.title.toLowerCase();
    const makeMatch = titleLower.includes(fitment.make.toLowerCase());
    const modelMatch = titleLower.includes(fitment.model.toLowerCase());

    if (makeMatch && modelMatch) {
      return {
        fitmentStatus: 'likely_fit',
        fitmentConfidence: 70,
        fitmentNotes: `Titel enthält ${fitment.make} ${fitment.model} – Kompatibilität im Angebot prüfen`,
      };
    }

    if (listing.category === 'ACCESSORIES') {
      return {
        fitmentStatus: 'universal',
        fitmentConfidence: 40,
        fitmentNotes:
          'Universalzubehör – Passform beim Verkäufer bestätigen',
      };
    }

    return {
      fitmentStatus: 'unknown',
      fitmentConfidence: 20,
      fitmentNotes:
        'Keine Fahrzeugzuordnung im eBay-Listing – manuell prüfen',
    };
  }

  private conditionLabel(condition: string): string {
    const labels: Record<string, string> = {
      new: 'Neu',
      refurbished: 'Generalüberholt',
      used: 'Gebraucht',
    };
    return labels[condition] ?? condition;
  }
}
