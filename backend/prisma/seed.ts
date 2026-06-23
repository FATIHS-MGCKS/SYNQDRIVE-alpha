import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding SynqDrive database...\n');

  // ---- PRODUCTS ----
  await prisma.product.create({
    data: { slug: 'RENTAL', name: 'SynqDrive Rental', description: 'Vehicle rental management module' },
  });
  await prisma.product.create({
    data: { slug: 'FLEET', name: 'SynqDrive Fleet', description: 'Fleet management & tracking module' },
  });
  await prisma.product.create({
    data: { slug: 'TAXI', name: 'SynqDrive Taxi', description: 'Taxi dispatch & management module' },
  });
  console.log('  Products created');

  // ---- INTEGRATIONS (platform-level catalog) ----
  await prisma.integration.create({
    data: { type: 'DIMO', scope: 'PLATFORM', name: 'DIMO Network', description: 'Decentralized vehicle telemetry via DIMO' },
  });
  await prisma.integration.create({
    data: { type: 'STRIPE', scope: 'ORGANIZATION', name: 'Stripe Payments', description: 'Payment processing with Stripe' },
  });
  await prisma.integration.create({
    data: { type: 'WOOCOMMERCE', scope: 'ORGANIZATION', name: 'WooCommerce', description: 'Online booking via WooCommerce' },
  });
  await prisma.integration.create({
    data: { type: 'SHOPIFY', scope: 'ORGANIZATION', name: 'Shopify', description: 'Online booking via Shopify' },
  });
  console.log('  Integrations catalog created');

  // ---- BILLING PRICEBOOK (shell — tiers/prices configured later by Master Admin) ----
  const existingDefaultBook = await prisma.billingPriceBook.findFirst({
    where: { isDefault: true },
  });
  if (!existingDefaultBook) {
    await prisma.billingPriceBook.create({
      data: {
        name: 'SynqDrive Platform — Per Connected Vehicle',
        productKey: 'FLEET',
        isDefault: true,
        currency: 'EUR',
      },
    });
    console.log('  Default billing price book created (no active version / no prices yet)');
  }

  // ---- MASTER ADMIN USER ----
  await prisma.user.create({
    data: {
      email: 'admin@synqdrive.de',
      name: 'Master Admin',
      platformRole: 'MASTER_ADMIN',
      status: 'ACTIVE',
      avatarUrl: null,
      lastLoginAt: new Date(),
    },
  });
  console.log('  Master Admin user created');

  // ---- NO ORGANIZATIONS, USERS, VEHICLES, PROSPECTS ----
  // Master admin starts empty. DIMO vehicles: use Vehicles → Non Registered → Sync from DIMO.
  console.log('  Master admin: empty (orgs, users, vehicles, prospects)');

  // ---- PARTS & ACCESSORIES PROVIDERS ----
  await prisma.partsProvider.upsert({
    where: { key: 'ALZURA' },
    update: {},
    create: {
      key: 'ALZURA',
      displayName: 'ALZURA Tyre24',
      description: 'European B2B tire and automotive parts marketplace with deep vehicle fitment data and embedded search capabilities.',
      isEnabled: true,
      integrationType: 'API',
      environmentMode: 'SANDBOX',
      supportedCategories: ['TIRES', 'PARTS'],
      configJson: { baseUrl: 'https://api.alzura.com/v1', market: 'DE' },
      capabilitiesJson: {
        supportsEmbeddedSearch: true,
        supportsEmbeddedProductDetails: true,
        supportsEmbeddedCart: true,
        supportsEmbeddedCheckout: true,
        supportsRedirectCheckout: false,
        supportsVehicleFitment: true,
        supportsTireSearch: true,
        supportsPartsSearch: true,
        supportsAccessoriesSearch: false,
      },
      healthStatus: 'UNKNOWN',
      rankingWeight: 100,
      timeoutMs: 15000,
      maxRetries: 2,
      rateLimitPerMin: 60,
    },
  });
  console.log('  ALZURA provider created');

  await prisma.partsProvider.upsert({
    where: { key: 'EBAY' },
    update: {},
    create: {
      key: 'EBAY',
      displayName: 'eBay Marketplace',
      description: 'Global marketplace with broad automotive parts, tires, and accessories selection from multiple sellers.',
      isEnabled: true,
      integrationType: 'MARKETPLACE',
      environmentMode: 'SANDBOX',
      supportedCategories: ['TIRES', 'PARTS', 'ACCESSORIES'],
      configJson: { baseUrl: 'https://api.ebay.com/buy/browse/v1', marketplaceId: 'EBAY_DE' },
      capabilitiesJson: {
        supportsEmbeddedSearch: true,
        supportsEmbeddedProductDetails: true,
        supportsEmbeddedCart: false,
        supportsEmbeddedCheckout: false,
        supportsRedirectCheckout: true,
        supportsVehicleFitment: false,
        supportsTireSearch: true,
        supportsPartsSearch: true,
        supportsAccessoriesSearch: true,
      },
      healthStatus: 'UNKNOWN',
      rankingWeight: 80,
      timeoutMs: 20000,
      maxRetries: 2,
      rateLimitPerMin: 30,
    },
  });
  console.log('  eBay Marketplace provider created');

  // ---- DEFAULT DISCLOSURE TEMPLATE ----
  const existingDisclosure = await prisma.partsDisclosureTemplate.findFirst({ where: { isActive: true } });
  if (!existingDisclosure) {
    await prisma.partsDisclosureTemplate.create({
      data: {
        providerKey: null,
        category: null,
        version: 1,
        title: 'Vehicle Data Disclosure for Parts Search',
        body: 'To search for compatible parts and accessories, the following vehicle data will be shared with the selected provider:\n\n• Vehicle make, model, year, and trim\n• Engine type and fuel type\n• Tire specifications (if searching tires)\n• VIN (if available, for precise fitment)\n• Body type and drivetrain\n\nThis data is used solely to find compatible products for your specific vehicle. The provider may store this data according to their privacy policy. No personal or organizational data beyond vehicle specifications is shared.\n\nBy confirming, you authorize this one-time data transfer for the current search session.',
        isActive: true,
        effectiveFrom: new Date(),
      },
    });
    console.log('  Default disclosure template created');
  } else {
    console.log('  Default disclosure template already exists, skipping');
  }

  // ---- INSURANCE PARTNERS ----
  const allianz = await prisma.insurancePartner.upsert({
    where: { key: 'ALLIANZ' },
    update: {},
    create: {
      key: 'ALLIANZ',
      displayName: 'Allianz Versicherung',
      description: 'Leading German insurance group with comprehensive fleet insurance products including usage-based and telematics-driven policies.',
      isEnabled: true,
      countryScope: ['DE', 'AT', 'CH'],
      supportedInquiryTypes: ['quote_standard', 'quote_usage_based', 'quote_kilometer_based', 'quote_driving_score', 'contract_optimization', 'dynamic_insurance_interest'],
      supportedInsuranceModels: ['usage_based', 'kilometer_based', 'driving_score_based', 'standard'],
      acceptedHistoricalData: ['odometer_history', 'mileage_summary', 'trip_history', 'trip_distance_aggregates', 'average_monthly_mileage', 'driving_score_history', 'harsh_braking_events', 'speeding_events', 'vehicle_utilization', 'maintenance_summary'],
      acceptedLiveData: ['odometer_updates', 'trip_distance', 'driving_score_updates', 'speeding_summaries', 'vehicle_utilization', 'trip_frequency'],
      communicationChannel: 'EMAIL',
      healthStatus: 'UNKNOWN',
      environment: 'SANDBOX',
      slaInfo: 'Typical response within 3-5 business days',
      supportsDynamicInsurance: true,
      supportsUsageBased: true,
      supportsKilometerBased: true,
      supportsDrivingScoreBased: true,
      rankingWeight: 100,
    },
  });
  console.log('  Allianz insurance partner seeded:', allianz.id);

  const hdiPartner = await prisma.insurancePartner.upsert({
    where: { key: 'HDI' },
    update: {},
    create: {
      key: 'HDI',
      displayName: 'HDI Versicherung',
      description: 'HDI fleet insurance with telematics integration and kilometer-based pricing models.',
      isEnabled: true,
      countryScope: ['DE'],
      supportedInquiryTypes: ['quote_standard', 'quote_kilometer_based', 'contract_optimization', 'replacement_insurer'],
      supportedInsuranceModels: ['kilometer_based', 'standard'],
      acceptedHistoricalData: ['odometer_history', 'mileage_summary', 'average_monthly_mileage', 'trip_distance_aggregates', 'vehicle_utilization'],
      acceptedLiveData: ['odometer_updates', 'trip_distance', 'vehicle_utilization'],
      communicationChannel: 'EMAIL',
      healthStatus: 'UNKNOWN',
      environment: 'SANDBOX',
      slaInfo: 'Typical response within 5-7 business days',
      supportsDynamicInsurance: false,
      supportsUsageBased: false,
      supportsKilometerBased: true,
      supportsDrivingScoreBased: false,
      rankingWeight: 80,
    },
  });
  console.log('  HDI insurance partner seeded:', hdiPartner.id);

  const axaPartner = await prisma.insurancePartner.upsert({
    where: { key: 'AXA' },
    update: {},
    create: {
      key: 'AXA',
      displayName: 'AXA Versicherung',
      description: 'AXA fleet insurance with full API integration and pay-as-you-drive models.',
      isEnabled: true,
      countryScope: ['DE', 'FR', 'CH'],
      supportedInquiryTypes: ['quote_standard', 'quote_usage_based', 'quote_driving_score', 'dynamic_insurance_interest'],
      supportedInsuranceModels: ['usage_based', 'driving_score_based', 'standard'],
      acceptedHistoricalData: ['odometer_history', 'mileage_summary', 'driving_score_history', 'harsh_braking_events', 'harsh_acceleration_events', 'speeding_events', 'nighttime_driving_share'],
      acceptedLiveData: ['odometer_updates', 'driving_score_updates', 'speeding_summaries', 'harsh_braking_summaries', 'time_of_day_patterns'],
      communicationChannel: 'API',
      configJson: { apiEndpoint: 'https://api.axa-fleet.example.com/v1/inquiries' },
      healthStatus: 'UNKNOWN',
      environment: 'SANDBOX',
      slaInfo: 'API response within 24 hours',
      supportsDynamicInsurance: true,
      supportsUsageBased: true,
      supportsKilometerBased: false,
      supportsDrivingScoreBased: true,
      rankingWeight: 90,
    },
  });
  console.log('  AXA insurance partner seeded:', axaPartner.id);

  // Seed contacts for Allianz
  const existingAllianzContact = await prisma.insurancePartnerContact.findFirst({
    where: { insurancePartnerId: allianz.id },
  });
  if (!existingAllianzContact) {
    await prisma.insurancePartnerContact.create({
      data: {
        insurancePartnerId: allianz.id,
        fullName: 'Thomas Weber',
        roleTitle: 'Fleet Insurance Manager',
        department: 'Commercial Fleet Division',
        email: 'fleet-inquiries@allianz.example.com',
        isPrimary: true,
      },
    });
    console.log('  Allianz primary contact created');
  }

  // Seed insurance disclosure template
  const existingInsuranceDisclosure = await prisma.insuranceDisclosureTemplate.findFirst({
    where: { isActive: true },
  });
  if (!existingInsuranceDisclosure) {
    await prisma.insuranceDisclosureTemplate.create({
      data: {
        title: 'Vehicle Data Sharing Authorization for Insurance Inquiry',
        body: 'By submitting this insurance inquiry, you authorize SynqDrive to share the selected vehicle data with the chosen insurance partner(s). This includes the historical data categories and time range you have selected, as well as any ongoing/live data sharing permissions you have enabled.\n\nThe shared data will be used by the insurance partner(s) solely for the purpose of evaluating your insurance inquiry, generating quotes, or optimizing your existing coverage.\n\nAn immutable audit log entry will be created for compliance and transparency purposes, recording exactly which data was shared, with whom, and when.\n\nYou may revoke any ongoing/live data sharing permissions at any time from the Insurance module.',
        version: 1,
        isActive: true,
        effectiveFrom: new Date(),
      },
    });
    console.log('  Default insurance disclosure template created');
  }

  // Seed inquiry template
  const existingInquiryTemplate = await prisma.insuranceInquiryTemplate.findFirst({
    where: { isActive: true },
  });
  if (!existingInquiryTemplate) {
    await prisma.insuranceInquiryTemplate.create({
      data: {
        inquiryType: 'quote_standard',
        subjectTemplate: 'Fleet Insurance Inquiry: {{make}} {{model}} {{year}}',
        bodyTemplate: 'Dear Insurance Partner,\n\nWe are submitting an insurance inquiry for the following vehicle:\n\nMake: {{make}}\nModel: {{model}}\nYear: {{year}}\nVIN: {{vin}}\nLicense Plate: {{licensePlate}}\n\nInquiry Type: {{inquiryType}}\nInsurance Models of Interest: {{insuranceModels}}\n\nPlease find the attached vehicle telemetry and historical data summary as authorized by the fleet operator.\n\nWe look forward to your response.\n\nBest regards,\nSynqDrive Fleet Management',
        version: 1,
        isActive: true,
        effectiveFrom: new Date(),
      },
    });
    console.log('  Default inquiry template created');
  }

  console.log('\n  Seeding complete!\n');
  console.log('  Summary:');
  console.log('  ───────────────────────────────────────');
  console.log('  3 Products (Rental, Fleet, Taxi)');
  console.log('  4 Integration types (DIMO, Stripe, WooCommerce, Shopify)');
  console.log('  2 Parts & Accessories providers (ALZURA, eBay)');
  console.log('  1 Default parts disclosure template');
  console.log('  3 Insurance partners (Allianz, HDI, AXA)');
  console.log('  1 Insurance disclosure template');
  console.log('  1 Insurance inquiry template');
  console.log('  1 Master Admin user');
  console.log('  ───────────────────────────────────────');
  console.log(`\n  API: http://localhost:3000/api/v1/`);
  console.log(`  Swagger: http://localhost:3000/docs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
