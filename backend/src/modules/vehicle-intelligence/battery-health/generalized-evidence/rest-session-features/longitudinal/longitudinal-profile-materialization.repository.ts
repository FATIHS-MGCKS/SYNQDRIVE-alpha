import { randomUUID } from 'crypto';
import {
  Prisma,
  type BatteryLongitudinalProfileRevision,
} from '@prisma/client';
import { canonicalFeatureInputUtf8 } from '../feature-input-canonical.serializer';
import type { PrismaService } from '@shared/database/prisma.service';
import { assertValidProfileFingerprintHex } from './longitudinal-profile-fingerprint';
import {
  ProfileFingerprintCollisionOrCanonicalizationDriftError,
  ProfileIdempotencyConflictRowNotFoundError,
} from './longitudinal-profile-materialization.errors';
import type { LongitudinalProfileMaterializationPersistenceInput } from './longitudinal-profile-materialization.mapper';
import { assertRevisionMetadataMirrorsPersistenceInput } from './longitudinal-profile-materialization.metadata-mirror';
import type { LongitudinalProfileMaterializationInsertOutcome } from './longitudinal-profile-materialization.types';

export type LongitudinalProfileMaterializationRepositoryDb = Pick<
  PrismaService,
  'batteryLongitudinalProfileRevision' | '$transaction'
>;

export type LongitudinalProfileScientificIdentity = {
  organizationId: string;
  vehicleId: string;
  longitudinalProfileContractVersion: string;
  profilePolicyVersion: string;
  canonicalProfileFingerprint: string;
};

export class LongitudinalProfileMaterializationRepository {
  constructor(private readonly db: LongitudinalProfileMaterializationRepositoryDb) {}

  findByScientificIdentity(
    identity: LongitudinalProfileScientificIdentity,
  ): Promise<BatteryLongitudinalProfileRevision | null> {
    return this.db.batteryLongitudinalProfileRevision.findFirst({
      where: {
        organizationId: identity.organizationId,
        vehicleId: identity.vehicleId,
        longitudinalProfileContractVersion: identity.longitudinalProfileContractVersion,
        profilePolicyVersion: identity.profilePolicyVersion,
        canonicalProfileFingerprint: identity.canonicalProfileFingerprint,
      },
    });
  }

  findById(id: string): Promise<BatteryLongitudinalProfileRevision | null> {
    return this.db.batteryLongitudinalProfileRevision.findUnique({ where: { id } });
  }

  /**
   * PostgreSQL-safe idempotent insert (explicit READ COMMITTED + ON CONFLICT DO NOTHING RETURNING).
   */
  async insertIdempotent(
    input: LongitudinalProfileMaterializationPersistenceInput,
    expectedCanonicalScientificUtf8: string,
  ): Promise<LongitudinalProfileMaterializationInsertOutcome> {
    assertValidProfileFingerprintHex(input.canonicalProfileFingerprint);

    return this.db.$transaction(
      async (tx) => {
        const id = randomUUID();
        const inserted = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO battery_longitudinal_profile_revisions (
            id,
            organization_id,
            vehicle_id,
            longitudinal_profile_contract_version,
            profile_policy_version,
            canonical_profile_fingerprint,
            scientific_profile_json,
            requested_session_limit,
            applied_session_limit,
            candidate_rest_session_count,
            included_session_count,
            provisional_session_count,
            excluded_session_count,
            first_included_anchor_at,
            last_included_anchor_at,
            profile_status
          ) VALUES (
            ${id},
            ${input.organizationId},
            ${input.vehicleId},
            ${input.longitudinalProfileContractVersion},
            ${input.profilePolicyVersion},
            ${input.canonicalProfileFingerprint},
            ${input.scientificProfileJson as Prisma.InputJsonValue},
            ${input.requestedSessionLimit},
            ${input.appliedSessionLimit},
            ${input.candidateRestSessionCount},
            ${input.includedSessionCount},
            ${input.provisionalSessionCount},
            ${input.excludedSessionCount},
            ${input.firstIncludedAnchorAt},
            ${input.lastIncludedAnchorAt},
            ${input.profileStatus}
          )
          ON CONFLICT (
            organization_id,
            vehicle_id,
            longitudinal_profile_contract_version,
            profile_policy_version,
            canonical_profile_fingerprint
          )
          DO NOTHING
          RETURNING id
        `;

        if (inserted.length > 0) {
          const revision = await tx.batteryLongitudinalProfileRevision.findUniqueOrThrow({
            where: { id: inserted[0].id },
          });
          return { persistenceOutcome: 'CREATED', revision };
        }

        const existing = await tx.batteryLongitudinalProfileRevision.findFirst({
          where: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            longitudinalProfileContractVersion: input.longitudinalProfileContractVersion,
            profilePolicyVersion: input.profilePolicyVersion,
            canonicalProfileFingerprint: input.canonicalProfileFingerprint,
          },
        });

        if (!existing) {
          throw new ProfileIdempotencyConflictRowNotFoundError();
        }

        const storedCanonicalUtf8 = canonicalFeatureInputUtf8(existing.scientificProfileJson);
        if (storedCanonicalUtf8 !== expectedCanonicalScientificUtf8) {
          throw new ProfileFingerprintCollisionOrCanonicalizationDriftError();
        }

        assertRevisionMetadataMirrorsPersistenceInput(existing, input);

        return { persistenceOutcome: 'EXISTING', revision: existing };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }
}
