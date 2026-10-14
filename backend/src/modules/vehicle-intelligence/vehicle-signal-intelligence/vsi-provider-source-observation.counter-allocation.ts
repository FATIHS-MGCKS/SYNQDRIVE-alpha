import type { PrismaClient } from '@prisma/client';
import type { VsiProviderSourceObservationScope } from './vsi-provider-source-observation.scope';

/**
 * Atomically allocate the next observation index for a scope (PostgreSQL upsert + increment).
 * Returns the allocated index; `next_observation_index` always points at the next free slot.
 */
export async function allocateObservationIndexAtomic(
  prisma: PrismaClient,
  scope: VsiProviderSourceObservationScope,
): Promise<bigint> {
  const rows = await prisma.$queryRaw<{ allocated: bigint | number }[]>`
    INSERT INTO vehicle_provider_source_observation_counters (
      organization_id,
      vehicle_id,
      provider,
      provider_binding_scope_key,
      provider_token_scope_key,
      next_observation_index
    ) VALUES (
      ${scope.organizationId},
      ${scope.vehicleId},
      ${scope.provider},
      ${scope.providerBindingScopeKey},
      ${scope.providerTokenScopeKey},
      2::bigint
    )
    ON CONFLICT (
      organization_id,
      vehicle_id,
      provider,
      provider_binding_scope_key,
      provider_token_scope_key
    )
    DO UPDATE SET
      next_observation_index = vehicle_provider_source_observation_counters.next_observation_index + 1
    RETURNING (next_observation_index - 1) AS allocated
  `;
  const allocated = rows[0]?.allocated;
  if (allocated === undefined || allocated === null) {
    throw new Error('VSI P2C counter allocation returned no row');
  }
  return typeof allocated === 'bigint' ? allocated : BigInt(allocated);
}
