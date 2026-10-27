import type { PartialTranslationDictionary } from '../dictionary-types';

/**
 * Turkish product-copy dictionary.
 * Intentionally sparse until P3 native translation work — runtime uses explicit English fallback.
 */
export const tr = {
  'trips.drivingImpact.quality.partial': 'Sınırlı veri kapsamı — değerlendirme eksik olabilir.',
  'trips.drivingImpact.quality.stale': 'Değerlendirme güncel olmayabilir (yolculuk verileri değişti).',
  'trips.drivingImpact.quality.legacyCompat': 'Eski yolculuk skoru yansımasından legacy değerlendirme — güncel Driving Impact hattı değil.',
  'trips.drivingImpact.quality.unavailable': 'Güvenilir araç yükü değerlendirmesi yok.',
  'trips.drivingImpact.quality.r1Contained': 'Araç yükü geçici olarak kullanılamıyor (R1 zaman sınırı).',
} satisfies PartialTranslationDictionary;
