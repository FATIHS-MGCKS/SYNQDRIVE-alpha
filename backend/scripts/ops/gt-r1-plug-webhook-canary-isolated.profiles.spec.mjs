import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANARY_PROFILES,
  parseIsolatedCliArgs,
  resolveIsolatedExecutionMode,
  resolveCanaryProfile,
  rejectArbitraryTokenCliArgs,
  findTempDefinitionsForProfile,
  validateExistingTempBeforeActivate,
  validatePreEnableSingleTokenOnly,
  validateSiblingCanariesUntouched,
  buildPostActivateVerification,
  postActivateVerificationPasses,
  buildProfileSemantics,
  TOKEN_WOB_7503,
} from './gt-r1-plug-webhook-canary-isolated.lib.mjs';

describe('isolated canary allowlisted profiles', () => {
  it('resolves WOB and KS MX profiles', () => {
    const wob = resolveCanaryProfile('WOB_L_7503');
    assert.equal(wob.ok, true);
    assert.equal(wob.profile.tokenId, 192922);
    const ks = resolveCanaryProfile('KS_MX_2024');
    assert.equal(ks.ok, true);
    assert.equal(ks.profile.tokenId, 187336);
    assert.notEqual(wob.profile.displayName, ks.profile.displayName);
  });

  it('rejects unknown profile', () => {
    const r = resolveCanaryProfile('EVIL_FLEET');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'unknown_canary_profile');
  });

  it('rejects arbitrary token CLI flags', () => {
    const r = rejectArbitraryTokenCliArgs(['--execute', '--token-id=999999']);
    assert.equal(r.rejected, true);
  });

  it('authorize KS activate only with matching confirm', () => {
    const parsed = parseIsolatedCliArgs([
      '--execute',
      '--phase=activate',
      '--canary=KS_MX_2024',
      '--confirm-canary=vdc-ks-mx-2024-plug-isolated-canary',
    ]);
    const mode = resolveIsolatedExecutionMode(parsed);
    assert.equal(mode.authorized, true);
    assert.equal(mode.profile.profileKey, 'KS_MX_2024');
  });

  it('rejects wrong confirmation for profile', () => {
    const parsed = parseIsolatedCliArgs([
      '--execute',
      '--phase=activate',
      '--canary=KS_MX_2024',
      '--confirm-canary=vdc-wob-7503-plug-isolated-canary',
    ]);
    const mode = resolveIsolatedExecutionMode(parsed);
    assert.equal(mode.authorized, false);
    assert.equal(mode.reason, 'confirm_canary_mismatch');
  });

  it('finds temp definitions per profile display name only', () => {
    const webhooks = [
      { id: 'w1', displayName: CANARY_PROFILES.WOB_L_7503.displayName },
      { id: 'k1', displayName: CANARY_PROFILES.KS_MX_2024.displayName },
      { id: 'other', displayName: 'Something else' },
    ];
    const wobTemps = findTempDefinitionsForProfile(webhooks, CANARY_PROFILES.WOB_L_7503);
    const ksTemps = findTempDefinitionsForProfile(webhooks, CANARY_PROFILES.KS_MX_2024);
    assert.equal(wobTemps.length, 1);
    assert.equal(ksTemps.length, 1);
    assert.equal(wobTemps[0].id, 'w1');
    assert.equal(ksTemps[0].id, 'k1');
  });

  it('WOB enabled + KS disabled existing allows KS activation precheck', () => {
    const wobOnly = validateExistingTempBeforeActivate([{ id: 'w', status: 'enabled' }]);
    assert.equal(wobOnly.abort, true);
    const ksNone = validateExistingTempBeforeActivate([]);
    assert.equal(ksNone.abort, false);
  });

  it('duplicate KS temp aborts', () => {
    const r = validateExistingTempBeforeActivate([{ id: 'a' }, { id: 'b' }]);
    assert.equal(r.abort, true);
  });

  it('WOB subscriber cannot appear on KS webhook', () => {
    const gate = validatePreEnableSingleTokenOnly([TOKEN_WOB_7503], CANARY_PROFILES.KS_MX_2024.tokenId);
    assert.equal(gate.abort, true);
    assert.equal(gate.reason, 'foreign_subscriber_abort');
  });

  it('KS subscriber cannot appear on WOB webhook', () => {
    const gate = validatePreEnableSingleTokenOnly(
      [CANARY_PROFILES.KS_MX_2024.tokenId],
      CANARY_PROFILES.WOB_L_7503.tokenId,
    );
    assert.equal(gate.abort, true);
  });

  it('sibling WOB canary remains valid when activating KS', () => {
    const siblingSnapshots = {
      WOB_L_7503: {
        tempWebhook: { id: 'w', status: 'enabled' },
        subscriberTokenIds: [TOKEN_WOB_7503],
      },
    };
    const gate = validateSiblingCanariesUntouched(siblingSnapshots, CANARY_PROFILES.KS_MX_2024);
    assert.equal(gate.ok, true);
  });

  it('sibling check fails if WOB canary corrupted', () => {
    const siblingSnapshots = {
      WOB_L_7503: {
        tempWebhook: { id: 'w', status: 'enabled' },
        subscriberTokenIds: [TOKEN_WOB_7503, CANARY_PROFILES.KS_MX_2024.tokenId],
      },
    };
    const gate = validateSiblingCanariesUntouched(siblingSnapshots, CANARY_PROFILES.KS_MX_2024);
    assert.equal(gate.ok, false);
  });

  it('unique webhook semantics per profile', () => {
    const wobSem = buildProfileSemantics(CANARY_PROFILES.WOB_L_7503);
    const ksSem = buildProfileSemantics(CANARY_PROFILES.KS_MX_2024);
    assert.notEqual(wobSem.displayName, ksSem.displayName);
    assert.equal(wobSem.metricName, ksSem.metricName);
    assert.equal(wobSem.condition, 'valueNumber == 1');
  });

  it('post-activate verification is profile-token scoped', () => {
    const pass = buildPostActivateVerification({
      tempWebhook: {
        id: 'temp',
        status: 'enabled',
        metricName: 'vss.obdIsPluggedIn',
        condition: 'valueNumber == 1',
        targetURL: 'https://app.synqdrive.eu/api/v1/webhooks/dimo',
      },
      subscriberTokenIds: [187336],
      legacyGlobalPlug: { status: 'disabled' },
      legacyUnplug: { status: 'enabled' },
      legacyPlugSubscriptionTokenIdsBefore: [1, 2],
      legacyPlugSubscriptionTokenIdsAfter: [1, 2],
      expectedTargetURL: 'https://app.synqdrive.eu/api/v1/webhooks/dimo',
      profile: CANARY_PROFILES.KS_MX_2024,
    });
    assert.equal(pass.TEMP_CANARY_SINGLE_TOKEN_ONLY, true);
    assert.equal(pass.TEMP_CANARY_ONLY_SUBSCRIBER_TOKEN, 187336);
    assert.equal(postActivateVerificationPasses(pass), true);
  });
});
