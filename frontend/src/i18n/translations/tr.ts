import type { PartialTranslationDictionary } from '../dictionary-types';
import { masterVehicleIdentityTr } from './master.vehicleIdentity.tr';
import { masterCvTechnicalSpecsTr } from './master.cv.technicalSpecs.tr';
import { masterIntelligenceTr } from './master.intelligence.tr';
import { tireWearV3Tr } from './tire.wearV3.tr';

/**
 * Turkish product-copy dictionary (partial).
 * Sparse native coverage — runtime uses explicit English fallback for missing keys.
 */
export const tr = {
  ...masterVehicleIdentityTr,
  ...masterCvTechnicalSpecsTr,
  ...masterIntelligenceTr,
  'trips.drivingImpact.quality.partial': 'Sınırlı veri kapsamı — değerlendirme eksik olabilir.',
  'trips.drivingImpact.quality.stale': 'Değerlendirme güncel olmayabilir (yolculuk verileri değişti).',
  'trips.drivingImpact.quality.pending': 'Driving Impact değerlendirmesi devam ediyor.',
  'trips.drivingImpact.quality.failed': 'Driving Impact değerlendirmesi başarısız — gösterilen skor güncel hattı yansıtmayabilir.',
  'trips.drivingImpact.quality.unsupported': 'Bu yolculuk için Driving Impact değerlendirmesi desteklenmiyor — gösterilen skor başka bir kaynaktan olabilir.',
  'trips.drivingImpact.quality.legacyCompat': 'Eski yolculuk skoru yansımasından legacy değerlendirme — güncel Driving Impact hattı değil.',
  'trips.drivingImpact.quality.unavailable': 'Güvenilir araç yükü değerlendirmesi yok.',
  'trips.drivingImpact.quality.r1Contained': 'Araç yükü geçici olarak kullanılamıyor (R1 zaman sınırı).',
  ...tireWearV3Tr,
} satisfies PartialTranslationDictionary;
