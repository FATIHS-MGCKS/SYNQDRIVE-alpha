#!/usr/bin/env ts-node
/**
 * EXP-021 S4F-7Q — bounded CLI for exact-RC PRESTATE deploy guard (no arbitrary shell hooks).
 */
import * as fs from 'fs';
import * as http from 'http';
import {
  assertDiS4f7qPreDeployEnvGates,
  assertDiS4f7qShaPins,
  assertMetricsTokenNotInOutput,
  decideDiS4f7qRollingContinue,
  envMapFromBackendEnvContent,
  evaluateDiS4f7qPreDeploy,
  verifyReplicaPrestateAttestationFromMetricsBody,
  type DiS4f7qAbortReason,
  type DiS4f7qRollingDecisionInput,
} from './di-v0-s4f7q-exact-rc-attestation-deploy.lib';

function readFile(pathname: string): string {
  return fs.readFileSync(pathname, 'utf8');
}

function envMapFromFile(file: string): Record<string, string | undefined> {
  const content = readFile(file);
  return envMapFromBackendEnvContent(content);
}

function httpGetMetrics(port: string, token: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: Number(port),
        path: '/api/v1/metrics',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error('metrics_auth_failure'));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`metrics_http_${res.statusCode ?? 0}`));
          return;
        }
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve(body));
      },
    );
    req.on('error', () => reject(new Error('metrics_transport_error')));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('metrics_timeout'));
    });
    req.end();
  });
}

function readDotenvValue(file: string, key: string): string {
  const content = readFile(file);
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    if (trimmed.slice(0, idx) !== key) continue;
    let v = trimmed.slice(idx + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return '';
}

function emitAbort(reason: DiS4f7qAbortReason): void {
  console.log(`ABORT_REASON=${reason}`);
  process.exit(1);
}

function cmdShaPins(target: string, oldSha: string): void {
  const reason = assertDiS4f7qShaPins({ targetSha: target, observedOldProductionSha: oldSha });
  if (reason) emitAbort(reason);
  console.log('SHA_PINS_OK=YES');
}

function cmdPredeployEnv(globalState: string, envFile: string): void {
  const env = envMapFromFile(envFile);
  const reason = assertDiS4f7qPreDeployEnvGates({ globalKillState: globalState, env });
  if (reason) emitAbort(reason);
  console.log('PREDEPLOY_ENV_OK=YES');
}

function cmdPredeployFull(target: string, oldSha: string, globalState: string, envFile: string): void {
  const env = envMapFromFile(envFile);
  const reason = evaluateDiS4f7qPreDeploy(
    { targetSha: target, observedOldProductionSha: oldSha },
    { globalKillState: globalState, env },
  );
  if (reason) emitAbort(reason);
  console.log('PREDEPLOY_FULL_OK=YES');
}

function cmdVerifyBody(bodyFile: string): void {
  const body = readFile(bodyFile);
  const result = verifyReplicaPrestateAttestationFromMetricsBody(body);
  if (!result.ok) emitAbort(result.reason);
  console.log('ATTESTATION_OK=YES');
}

async function cmdFetchVerify(envFile: string, port: string): Promise<void> {
  const token = readDotenvValue(envFile, 'METRICS_BEARER_TOKEN');
  if (!token) {
    console.log('ABORT_REASON=METRICS_AUTH_FAILURE');
    process.exit(1);
  }
  let body = '';
  try {
    body = await httpGetMetrics(port, token, 8000);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'metrics_auth_failure') emitAbort('METRICS_AUTH_FAILURE');
    if (msg === 'metrics_timeout') emitAbort('METRICS_TIMEOUT');
    emitAbort('REPLICA_HEALTH_FAILURE');
  }
  const logSafe = `port=${port} bytes=${body.length}`;
  if (!assertMetricsTokenNotInOutput(logSafe, token)) {
    console.log('METRICS_TOKEN_LOGGED=YES');
    process.exit(1);
  }
  const result = verifyReplicaPrestateAttestationFromMetricsBody(body);
  if (!result.ok) emitAbort(result.reason);
  console.log('ATTESTATION_OK=YES');
}

function cmdRollingDecision(jsonFile: string): void {
  const raw = readFile(jsonFile);
  const input = JSON.parse(raw) as DiS4f7qRollingDecisionInput;
  const decision = decideDiS4f7qRollingContinue(input);
  console.log(`ALLOW_CONTINUE=${decision.allowContinue ? 'YES' : 'NO'}`);
  console.log(`ALLOW_RESTART_B=${decision.allowRestartB ? 'YES' : 'NO'}`);
  if (decision.reason) console.log(`ABORT_REASON=${decision.reason}`);
  if (!decision.allowContinue) process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  switch (cmd) {
    case 'sha-pins':
      cmdShaPins(args[1] ?? '', args[2] ?? '');
      break;
    case 'predeploy-env':
      cmdPredeployEnv(args[1] ?? '', args[2] ?? '');
      break;
    case 'predeploy-full':
      cmdPredeployFull(args[1] ?? '', args[2] ?? '', args[3] ?? '', args[4] ?? '');
      break;
    case 'verify-metrics-body':
      cmdVerifyBody(args[1] ?? '');
      break;
    case 'fetch-verify-prestate': {
      const envFile = args[1];
      const port = args[2];
      if (!envFile || !port) process.exit(2);
      await cmdFetchVerify(envFile, port);
      break;
    }
    case 'rolling-decision':
      cmdRollingDecision(args[1] ?? '');
      break;
    default:
      console.error(
        'usage: cli.ts <sha-pins|predeploy-env|predeploy-full|verify-metrics-body|fetch-verify-prestate|rolling-decision> ...',
      );
      process.exit(2);
  }
}

main().catch(() => process.exit(1));
