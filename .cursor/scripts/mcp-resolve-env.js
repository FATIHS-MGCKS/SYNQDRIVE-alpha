#!/usr/bin/env node
/**
 * Resolves ${env:VAR} and ${workspaceFolder} in .cursor/mcp.json.example
 * and writes runtime MCP configs (secrets inlined — gitignored outputs only).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const TEMPLATE = path.join(ROOT, '.cursor/mcp.json.example');
const OUT_WORKSPACE = path.join(ROOT, '.cursor/mcp.json');
const OUT_GLOBAL = path.join(process.env.HOME || '/root', '.cursor/mcp.json');
const OUT_DASHBOARD = path.join(ROOT, '.cursor/mcp.dashboard.json');

const REQUIRED_ENV = {
  dimo: ['DIMO_CLIENT_ID', 'DIMO_PRIVATE_KEY', 'DIMO_DOMAIN'],
  'hostinger-api': ['HOSTINGER_API_TOKEN'],
  resend: ['RESEND_API_KEY'],
  stripe: ['STRIPE_SECRET_KEY'],
  didit: [],
};

function interpolateString(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\$\{workspaceFolder\}/g, ROOT)
    .replace(/\$\{env:([^}]+)\}/g, (_, name) => process.env[name] ?? '');
}

function interpolateValue(value) {
  if (typeof value === 'string') return interpolateString(value);
  if (Array.isArray(value)) return value.map(interpolateValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolateValue(v);
    return out;
  }
  return value;
}

function hasUnresolvedEnv(value) {
  if (typeof value === 'string') return /\$\{env:[^}]+\}/.test(value);
  if (Array.isArray(value)) return value.some(hasUnresolvedEnv);
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasUnresolvedEnv);
  }
  return false;
}

function serverReady(name, config) {
  const required = REQUIRED_ENV[name] ?? [];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return { ready: false, reason: `missing env: ${missing.join(', ')}` };
  }
  if (hasUnresolvedEnv(config)) {
    return { ready: false, reason: 'unresolved ${env:…} placeholders' };
  }
  return { ready: true };
}

function main() {
  if (!fs.existsSync(TEMPLATE)) {
    console.error(`[mcp-resolve] Missing template: ${TEMPLATE}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const resolved = { mcpServers: {} };
  const status = [];

  for (const [name, config] of Object.entries(raw.mcpServers ?? {})) {
    const interpolated = interpolateValue(config);
    const check = serverReady(name, interpolated);
    if (check.ready) {
      resolved.mcpServers[name] = interpolated;
      status.push({ name, state: 'ready' });
    } else {
      status.push({ name, state: 'skipped', reason: check.reason });
    }
  }

  const writeJson = (target) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(resolved, null, 2)}\n`, { mode: 0o600 });
  };

  writeJson(OUT_WORKSPACE);
  writeJson(OUT_GLOBAL);
  writeJson(OUT_DASHBOARD);

  console.log('[mcp-resolve] Wrote runtime MCP configs:');
  console.log(`  - ${OUT_WORKSPACE}`);
  console.log(`  - ${OUT_GLOBAL}`);
  console.log(`  - ${OUT_DASHBOARD} (paste into https://cursor.com/agents → Custom MCP)`);
  console.log('[mcp-resolve] Server status:');
  for (const row of status) {
    if (row.state === 'ready') {
      console.log(`  ✓ ${row.name}`);
    } else {
      console.log(`  ✗ ${row.name} (${row.reason})`);
    }
  }
  console.log('');
  console.log('[mcp-resolve] Cloud Agents do NOT resolve ${env:…} in the dashboard.');
  console.log('[mcp-resolve] Copy .cursor/mcp.dashboard.json into cursor.com/agents (secrets inlined).');
  console.log('[mcp-resolve] Didit + Figma still need one-time OAuth in the MCP UI.');
}

main();
