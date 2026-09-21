/**
 * VDC OBD PLUG — isolated single-vehicle canary lifecycle (DESIGN + READ_ONLY ONLY).
 *
 * DIMO enables webhooks at the **definition** level (global). Per-vehicle delivery is
 * controlled by per-webhook subscription lists. Enabling the legacy global PLUG definition
 * (`7a0562d3-…`) activates callbacks for **all** tokens already subscribed (currently 6),
 * which is NOT a WOB-only canary.
 *
 * Recommended topology (A): create a **temporary** PLUG definition, subscribe ONLY WOB
 * token 192922, enable only that definition, observe GT replug, then disable/unsubscribe/delete.
 *
 * This script does NOT mutate Production. It documents the lifecycle and validates CLI gates
 * for a future `--execute` implementation mirroring `r9-subscribe-probe.mjs` cleanup patterns.
 *
 * Lifecycle (future authorized mutation — not implemented in execute path yet):
 *   1. POST /v1/webhooks — temporary PLUG semantics (valueNumber == 1)
 *   2. POST /v1/webhooks/{tempId}/subscribe/{WOB assetDID}
 *   3. PUT status=enabled on temp definition only (legacy global PLUG stays disabled)
 *   4. OBSERVE operator GT replug on WOB L 7503
 *   5. PUT status=disabled on temp definition
 *   6. DELETE unsubscribe WOB from temp definition
 *   7. DELETE temp webhook definition (idempotent if already deleted)
 *
 * Cleanup idempotency: each step treats 404 as success for delete/unsubscribe.
 */
import {
  PLUG_ID,
  TOKEN_WOB_7503,
  VEHICLE_WOB_7503,
  EXPECTED_PLUG_SEMANTICS,
  parseCliArgs,
  resolveExecutionMode,
} from './gt-r1-plug-webhook-restoration.lib.mjs';

const LEGACY_GLOBAL_PLUG_ID = PLUG_ID;

const out = {
  sessionUtc: new Date().toISOString(),
  mode: 'READ_ONLY',
  topology: 'A_TEMPORARY_PARALLEL_PLUG_WEBHOOK',
  legacyGlobalPlugId: LEGACY_GLOBAL_PLUG_ID,
  wobTokenId: TOKEN_WOB_7503,
  wobVehicleId: VEHICLE_WOB_7503,
  notWobOnlyCanaryWarning:
    'Enabling legacy global PLUG definition activates all tokens on its subscription list (currently 6). This is not WOB-only.',
  recommendedLifecycle: [
    'CREATE_TEMP_PLUG_WEBHOOK',
    'SUBSCRIBE_WOB_ONLY',
    'ENABLE_TEMP_ONLY',
    'OBSERVE_GT_REPLUG',
    'DISABLE_TEMP',
    'UNSUBSCRIBE_WOB',
    'DELETE_TEMP_WEBHOOK',
  ],
  expectedPlugSemantics: EXPECTED_PLUG_SEMANTICS,
  executeImplemented: false,
  message:
    'Design-only script. No DIMO API calls. Use gt-r1-plug-webhook-restoration.mjs for legacy global definition inspection.',
};

const cli = parseCliArgs(process.argv.slice(2));
const gate = resolveExecutionMode(cli);
out.executionGate = { ...cli, ...gate };

if (cli.execute) {
  out.abort = true;
  out.reason = 'isolated_canary_execute_not_implemented_use_design_review_gate';
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(out, null, 2));
