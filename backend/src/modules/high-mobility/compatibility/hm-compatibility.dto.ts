/**
 * High Mobility Compatibility DTOs (V4.6.77)
 *
 * Plain data-shape types; validation is done inline in the service (query
 * params come through the NestJS @Query decorator as strings). These DTOs
 * exist so controllers and tests share a single contract.
 */

export interface CompatibilityCheckQueryDto {
  /** Raw brand as typed/selected by operator (display or normalized). */
  brand: string;
  /** Raw model as typed/selected by operator. */
  model: string;
  /** Optional model year. Lookup picks the record whose [from..to] range contains this year. */
  year?: number;
}

export interface CompatibilityListModelsQueryDto {
  brand: string;
}
