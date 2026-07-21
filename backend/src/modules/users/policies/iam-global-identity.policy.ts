/**
 * Global identity vs org membership boundary (Prompt 2/22 target contract).
 */

export type GlobalIdentityMutation =
  | 'SET_PASSWORD_HASH'
  | 'CHANGE_EMAIL'
  | 'CHANGE_GLOBAL_STATUS';

export type IdentityMutationActor = 'ORG_ADMIN' | 'SELF' | 'MASTER_ADMIN';

/**
 * Target: org admins may manage membership but must not mutate global credentials.
 */
export const TARGET_GLOBAL_IDENTITY_POLICY: Record<
  GlobalIdentityMutation,
  IdentityMutationActor[]
> = {
  SET_PASSWORD_HASH: ['SELF', 'MASTER_ADMIN'],
  CHANGE_EMAIL: ['SELF', 'MASTER_ADMIN'],
  CHANGE_GLOBAL_STATUS: ['MASTER_ADMIN'],
};

export function orgAdminMayMutateGlobalIdentity(
  mutation: GlobalIdentityMutation,
): boolean {
  return TARGET_GLOBAL_IDENTITY_POLICY[mutation].includes('ORG_ADMIN');
}
