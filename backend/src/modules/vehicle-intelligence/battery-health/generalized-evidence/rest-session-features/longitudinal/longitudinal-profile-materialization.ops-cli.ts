import type { LongitudinalProfileMaterializationOpsContext } from './longitudinal-profile-materialization.ops-bootstrap';
import {
  closeLongitudinalProfileMaterializationOpsContext,
  createLongitudinalProfileMaterializationOpsContext,
} from './longitudinal-profile-materialization.ops-bootstrap';
import { parseCliSessionLimitArg } from './longitudinal-profile-materialization.runtime-config';
import {
  describeLongitudinalMaterializationSessionLimitForOps,
  runLongitudinalProfileMaterializeOps,
} from './longitudinal-profile-materialization.ops-runner';

export type LongitudinalProfileMaterializeCliDeps = {
  argv: readonly string[];
  createContext?: typeof createLongitudinalProfileMaterializationOpsContext;
  closeContext?: typeof closeLongitudinalProfileMaterializationOpsContext;
  runOps?: typeof runLongitudinalProfileMaterializeOps;
  log?: (message: string) => void;
  logError?: (message: string) => void;
};

function parseArg(argv: readonly string[], prefix: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`${prefix}=`));
  return hit?.split('=').slice(1).join('=').trim();
}

function resolveMaterializeExitCode(
  result: Awaited<ReturnType<typeof runLongitudinalProfileMaterializeOps>>,
): number {
  if ('status' in result && result.status === 'INVALID_ARGS') {
    return 1;
  }
  return 0;
}

/**
 * Executable ops lifecycle for D3 materialize CLI.
 * Returns a process exit code; caller must set process.exitCode (never process.exit after bootstrap).
 */
export async function runBatteryLongitudinalProfileMaterializeCli(
  deps: LongitudinalProfileMaterializeCliDeps,
): Promise<number> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const logError = deps.logError ?? ((message: string) => console.error(message));
  const createContext = deps.createContext ?? createLongitudinalProfileMaterializationOpsContext;
  const closeContext = deps.closeContext ?? closeLongitudinalProfileMaterializationOpsContext;
  const runOps = deps.runOps ?? runLongitudinalProfileMaterializeOps;

  const organizationId = parseArg(deps.argv, '--organization-id');
  const vehicleId = parseArg(deps.argv, '--vehicle-id');
  const sessionLimitRaw = parseArg(deps.argv, '--session-limit');

  if (!organizationId || !vehicleId) {
    logError(
      'Usage: battery-longitudinal-profile-materialize.ts --organization-id=... --vehicle-id=... [--session-limit=<positive-int>]',
    );
    return 1;
  }

  const cliLimit = parseCliSessionLimitArg(sessionLimitRaw);
  if (cliLimit.status === 'INVALID') {
    logError(cliLimit.message);
    return 1;
  }

  const sessionLimitOverride = cliLimit.status === 'OK' ? cliLimit.value : undefined;

  const limitInfo = describeLongitudinalMaterializationSessionLimitForOps(sessionLimitOverride);
  if ('status' in limitInfo) {
    logError(limitInfo.message);
    return 1;
  }

  logError(
    `longitudinal_materialization_ops session_limit=${limitInfo.sessionLimit} configured_default=${limitInfo.configuredDefault}`,
  );

  const ctx: LongitudinalProfileMaterializationOpsContext = await createContext();

  try {
    const result = await runOps(ctx.runtime, {
      organizationId,
      vehicleId,
      sessionLimitOverride,
    });

    log(JSON.stringify(result, null, 2));
    return resolveMaterializeExitCode(result);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await closeContext(ctx).catch(() => undefined);
  }
}
