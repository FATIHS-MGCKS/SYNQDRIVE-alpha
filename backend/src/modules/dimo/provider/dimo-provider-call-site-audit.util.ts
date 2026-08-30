import * as fs from 'fs';
import * as path from 'path';

export type DimoProviderCallSiteClassification =
  | 'FULL_CONTEXT_REQUIRED'
  | 'TOKEN_ONLY_LEGITIMATE'
  | 'CONTEXT_UNAVAILABLE_BUT_REGISTERED_PATH'
  | 'NOT_PROVIDER_BOUND';

export interface DimoProviderCallSiteAuditEntry {
  file: string;
  line: number;
  method: string;
  classification: DimoProviderCallSiteClassification;
  reason: string;
}

const PROVIDER_FETCH_METHOD_PATTERN =
  /\.(?:segments|dimoSegments|dimoTelemetry|telemetry|brakingIntake|rechargeClient)\.(fetch[A-Z]\w*|queryGraphQL)\s*\(/g;

const CONTEXT_PROPAGATION_MARKERS = [
  'requestContext',
  'providerContext',
  'dimoProviderContext',
  'buildDimoProviderRequestContext',
  'mergeDimoProviderRequestContext',
  'fetchForVehicle',
];

/** Paths where tokenId-only is architecturally correct (no registered SynqDrive vehicle/org). */
const TOKEN_ONLY_FILE_SUFFIXES = [
  'dimo-api-sync.service.ts',
  'dimo.controller.ts',
  'dimo-segments.service.ts',
  'dimo-telemetry.service.ts',
  'dimo-recharge-segments.graphql.ts',
  'dimo-recharge-segments.client.ts',
  'energy-events-standalone-dimo-fetch.ts',
];

const NOT_PROVIDER_BOUND_FILE_SUFFIXES = [
  'energy-events-standalone-dimo-fetch.ts',
];

function isTestOrSpecFile(filePath: string): boolean {
  return (
    filePath.includes('.spec.') ||
    filePath.includes('.test.') ||
    filePath.includes('/__tests__/')
  );
}

function relativeBackendPath(absPath: string, backendRoot: string): string {
  return path.relative(backendRoot, absPath).replace(/\\/g, '/');
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkTsFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function callBlockHasContextMarker(source: string, callStart: number): boolean {
  const slice = source.slice(Math.max(0, callStart - 250), callStart + 900);
  if (CONTEXT_PROPAGATION_MARKERS.some((marker) => slice.includes(marker))) {
    return true;
  }
  return /organizationId\s*[:,]|vehicleId\s*[:,]/.test(slice);
}

function classifyFile(file: string): DimoProviderCallSiteClassification | null {
  if (NOT_PROVIDER_BOUND_FILE_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
    return 'NOT_PROVIDER_BOUND';
  }
  if (TOKEN_ONLY_FILE_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
    return 'TOKEN_ONLY_LEGITIMATE';
  }
  return null;
}

export function scanDimoProviderCallSites(
  backendRoot = path.resolve(__dirname, '../../../..'),
): DimoProviderCallSiteAuditEntry[] {
  const srcRoot = path.join(backendRoot, 'src');
  const scriptsRoot = path.join(backendRoot, 'scripts');
  const files = [...walkTsFiles(srcRoot), ...walkTsFiles(scriptsRoot)];
  const entries: DimoProviderCallSiteAuditEntry[] = [];

  for (const absPath of files) {
    const file = relativeBackendPath(absPath, backendRoot);
    if (isTestOrSpecFile(file)) continue;

    const source = fs.readFileSync(absPath, 'utf8');
    const fileClassification = classifyFile(file);

    let match: RegExpExecArray | null;
    const pattern = new RegExp(PROVIDER_FETCH_METHOD_PATTERN.source, 'g');
    while ((match = pattern.exec(source)) !== null) {
      const method = match[1];
      const line =
        source.slice(0, match.index).split('\n').length;
      const hasContext = callBlockHasContextMarker(source, match.index);

      let classification: DimoProviderCallSiteClassification;
      let reason: string;

      if (fileClassification === 'NOT_PROVIDER_BOUND') {
        classification = 'NOT_PROVIDER_BOUND';
        reason = 'Direct DIMO HTTP bypasses provider gateway admission';
      } else if (fileClassification === 'TOKEN_ONLY_LEGITIMATE') {
        classification = 'TOKEN_ONLY_LEGITIMATE';
        reason = 'Pre-registration or internal gateway implementation path';
      } else if (hasContext) {
        classification = 'FULL_CONTEXT_REQUIRED';
        reason = 'Registered-vehicle path propagates canonical requestContext';
      } else {
        classification = 'CONTEXT_UNAVAILABLE_BUT_REGISTERED_PATH';
        reason = 'Registered-vehicle provider call missing canonical requestContext';
      }

      entries.push({ file, line, method, classification, reason });
    }
  }

  return entries.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
  );
}

export function summarizeDimoProviderCallSiteAudit(
  entries: DimoProviderCallSiteAuditEntry[],
): Record<DimoProviderCallSiteClassification, number> {
  return entries.reduce(
    (acc, entry) => {
      acc[entry.classification] += 1;
      return acc;
    },
    {
      FULL_CONTEXT_REQUIRED: 0,
      TOKEN_ONLY_LEGITIMATE: 0,
      CONTEXT_UNAVAILABLE_BUT_REGISTERED_PATH: 0,
      NOT_PROVIDER_BOUND: 0,
    } as Record<DimoProviderCallSiteClassification, number>,
  );
}
