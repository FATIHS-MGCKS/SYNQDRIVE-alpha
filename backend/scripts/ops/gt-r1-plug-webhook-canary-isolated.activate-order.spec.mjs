import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATE_TEMP_INITIAL_STATUS,
  TOKEN_WOB_7503,
  TEMP_PLUG_SEMANTICS,
  ACTIVATION_SEQUENCE,
  PARTIAL_ROLLBACK_SEQUENCE,
  TEARDOWN_SEQUENCE,
  buildTempWebhookPayload,
  verifyTempDefinition,
  validateExistingTempBeforeActivate,
  validatePreEnableWobOnly,
  analyzeTempSubscribers,
  buildPostActivateVerification,
  postActivateVerificationPasses,
} from './gt-r1-plug-webhook-canary-isolated.lib.mjs';

const TARGET = 'https://app.synqdrive.eu/api/v1/webhooks/dimo';

describe('isolated canary activation order', () => {
  it('CREATE uses disabled initial status', () => {
    const payload = buildTempWebhookPayload(TEMP_PLUG_SEMANTICS, TARGET, 'tok', CREATE_TEMP_INITIAL_STATUS);
    assert.equal(payload.status, 'disabled');
    assert.equal(payload.metricName, 'vss.obdIsPluggedIn');
    assert.equal(payload.condition, 'valueNumber == 1');
  });

  it('activation sequence subscribes before enable step', () => {
    const subIdx = ACTIVATION_SEQUENCE.indexOf('SUBSCRIBE_WOB_WHILE_DISABLED');
    const enableIdx = ACTIVATION_SEQUENCE.indexOf('ENABLE_TEMP');
    const recordIdx = ACTIVATION_SEQUENCE.indexOf('RECORD_PLUG_WEBHOOK_CANARY_ACTIVATED_AT');
    assert.ok(subIdx >= 0 && enableIdx > subIdx);
    assert.ok(recordIdx > enableIdx);
  });

  it('activation timestamp step is after VERIFY_ENABLED', () => {
    const verifyIdx = ACTIVATION_SEQUENCE.indexOf('VERIFY_ENABLED');
    const recordIdx = ACTIVATION_SEQUENCE.indexOf('RECORD_PLUG_WEBHOOK_CANARY_ACTIVATED_AT');
    assert.ok(recordIdx > verifyIdx);
  });

  it('pre-enable requires WOB-only subscriber', () => {
    const ok = validatePreEnableWobOnly([TOKEN_WOB_7503]);
    assert.equal(ok.abort, false);
    assert.equal(ok.analysis.TEMP_CANARY_WOB_ONLY, true);

    const foreign = validatePreEnableWobOnly([TOKEN_WOB_7503, 187336]);
    assert.equal(foreign.abort, true);
    assert.equal(foreign.reason, 'foreign_subscriber_abort');

    const empty = validatePreEnableWobOnly([]);
    assert.equal(empty.abort, true);
    assert.equal(empty.reason, 'pre_enable_wob_only_verification_failed');
  });

  it('already-enabled temp aborts', () => {
    const r = validateExistingTempBeforeActivate([{ id: 't1', status: 'enabled' }]);
    assert.equal(r.abort, true);
    assert.equal(r.reason, 'preexisting_enabled_temp_abort');
  });

  it('multiple temp definitions abort', () => {
    const r = validateExistingTempBeforeActivate([{ id: 'a' }, { id: 'b' }]);
    assert.equal(r.abort, true);
    assert.equal(r.reason, 'multiple_temp_canary_definitions_conflict');
  });

  it('disabled existing temp may proceed', () => {
    const r = validateExistingTempBeforeActivate([{ id: 't1', status: 'disabled' }]);
    assert.equal(r.abort, false);
    assert.equal(r.existing.id, 't1');
  });

  it('post-activate verification passes only when enabled WOB-only and legacy safe', () => {
    const pass = buildPostActivateVerification({
      tempWebhook: {
        id: 'temp',
        status: 'enabled',
        metricName: 'vss.obdIsPluggedIn',
        condition: 'valueNumber == 1',
        targetURL: TARGET,
      },
      subscriberTokenIds: [TOKEN_WOB_7503],
      legacyGlobalPlug: { status: 'disabled' },
      legacyUnplug: { status: 'enabled' },
      legacyPlugSubscriptionTokenIdsBefore: [1, 2],
      legacyPlugSubscriptionTokenIdsAfter: [1, 2],
      expectedTargetURL: TARGET,
    });
    assert.equal(postActivateVerificationPasses(pass), true);
    assert.equal(pass.TEMP_CANARY_SUBSCRIBER_COUNT, 1);
    assert.equal(pass.LEGACY_GLOBAL_PLUG_ENABLED, false);
    assert.equal(pass.UNPLUG_WEBHOOK_ENABLED, true);
  });

  it('post-activate fails if legacy global PLUG enabled', () => {
    const fail = buildPostActivateVerification({
      tempWebhook: {
        id: 'temp',
        status: 'enabled',
        metricName: 'vss.obdIsPluggedIn',
        condition: 'valueNumber == 1',
        targetURL: TARGET,
      },
      subscriberTokenIds: [TOKEN_WOB_7503],
      legacyGlobalPlug: { status: 'enabled' },
      legacyUnplug: { status: 'enabled' },
      legacyPlugSubscriptionTokenIdsBefore: [1],
      legacyPlugSubscriptionTokenIdsAfter: [1],
      expectedTargetURL: TARGET,
    });
    assert.equal(postActivateVerificationPasses(fail), false);
  });

  it('partial rollback sequence is explicit disable unsubscribe delete', () => {
    assert.deepEqual(PARTIAL_ROLLBACK_SEQUENCE, ['DISABLE_TEMP', 'UNSUBSCRIBE_WOB', 'DELETE_TEMP']);
  });

  it('teardown sequence includes postcondition verification steps', () => {
    assert.ok(TEARDOWN_SEQUENCE.includes('VERIFY_DISABLED'));
    assert.ok(TEARDOWN_SEQUENCE.includes('VERIFY_UNSUBSCRIBED'));
    assert.ok(TEARDOWN_SEQUENCE.includes('VERIFY_TEMP_ABSENT'));
  });

  it('verifyTempDefinition rejects wrong metric', () => {
    const r = verifyTempDefinition({ metricName: 'x', condition: 'valueNumber == 1', targetURL: TARGET }, TARGET);
    assert.equal(r.ok, false);
  });

  it('analyzeTempSubscribers foreign detection', () => {
    const a = analyzeTempSubscribers([192922, 187336]);
    assert.equal(a.TEMP_CANARY_WOB_ONLY, false);
    assert.deepEqual(a.foreignSubscriberTokenIds, [187336]);
  });
});
