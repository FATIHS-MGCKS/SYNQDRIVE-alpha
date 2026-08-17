#!/usr/bin/env node
'use strict';

const fs = require('fs');

function readJson(path) {
  if (!path || !fs.existsSync(path)) {
    throw new Error(`Missing audit JSON: ${path || '(empty)'}`);
  }
  const raw = fs.readFileSync(path, 'utf8').trim();
  if (!raw) {
    throw new Error(`Empty audit JSON: ${path}`);
  }
  return JSON.parse(raw);
}

function advisoryKey(via) {
  if (typeof via !== 'object' || via == null) {
    return null;
  }
  const url = String(via.url || '');
  if (url.includes('GHSA-')) {
    return url.replace(/\/+$/, '').split('/').pop();
  }
  if (via.source != null) {
    return `npm:${via.source}`;
  }
  return null;
}

function normalizeFindings(audit, surface) {
  const bySeverityPackage = new Map();
  const directVulnerable = new Set();
  const vulnerabilities = audit.vulnerabilities || {};

  for (const [pkg, info] of Object.entries(vulnerabilities)) {
    const severity = String(info.severity || '').toLowerCase();
    if (severity !== 'high' && severity !== 'critical') {
      continue;
    }

    const viaEntries = Array.isArray(info.via) ? info.via : [info.via];
    const advisoryIds = new Set();
    for (const via of viaEntries) {
      const key = advisoryKey(via);
      if (key) {
        advisoryIds.add(key);
      }
    }
    if (advisoryIds.size === 0) {
      advisoryIds.add(`${pkg}:${info.range || 'unknown-range'}`);
    }

    const bucketKey = `${severity}:${pkg}`;
    if (!bySeverityPackage.has(bucketKey)) {
      bySeverityPackage.set(bucketKey, {
        identity: bucketKey,
        package: pkg,
        severity,
        advisory_ids: new Set(),
        affected_node_paths: new Set(),
        direct: Boolean(info.isDirect),
        surface,
      });
    }
    const bucket = bySeverityPackage.get(bucketKey);
    for (const id of advisoryIds) {
      bucket.advisory_ids.add(id);
    }
    for (const node of info.nodes || []) {
      bucket.affected_node_paths.add(node);
    }
    bucket.direct = bucket.direct || Boolean(info.isDirect);
    if (info.isDirect) {
      directVulnerable.add(`${severity}:${pkg}`);
    }
  }

  const findings = [...bySeverityPackage.values()]
    .map((bucket) => ({
      identity: `${bucket.severity}:${bucket.package}:${[...bucket.advisory_ids].sort().join('+')}`,
      package: bucket.package,
      severity: bucket.severity,
      advisory_ids: [...bucket.advisory_ids].sort(),
      affected_node_paths: [...bucket.affected_node_paths].sort(),
      direct: bucket.direct,
      surface,
    }))
    .sort((a, b) => a.identity.localeCompare(b.identity));

  return { findings, directVulnerable: [...directVulnerable].sort() };
}

function compareSurface(baseAudit, prAudit, surface) {
  const base = normalizeFindings(baseAudit, surface);
  const pr = normalizeFindings(prAudit, surface);

  const baseMap = new Map(base.findings.map((f) => [f.identity, f]));
  const prMap = new Map(pr.findings.map((f) => [f.identity, f]));

  const introduced = [];
  const removed = [];

  const baseByBucket = new Map(base.findings.map((f) => [`${f.severity}:${f.package}`, f]));
  const prByBucket = new Map(pr.findings.map((f) => [`${f.severity}:${f.package}`, f]));

  for (const prFinding of pr.findings) {
    const bucketKey = `${prFinding.severity}:${prFinding.package}`;
    const baseFinding = baseByBucket.get(bucketKey);
    const prSet = new Set(prFinding.advisory_ids);
    const baseSet = new Set(baseFinding?.advisory_ids || []);
    const newAdvisories = [...prSet].filter((id) => !baseSet.has(id));
    if (newAdvisories.length > 0) {
      introduced.push({
        ...prFinding,
        identity: `${prFinding.severity}:${prFinding.package}:${newAdvisories.sort().join('+')}`,
        advisory_ids: newAdvisories.sort(),
      });
    }
  }

  for (const baseFinding of base.findings) {
    const bucketKey = `${baseFinding.severity}:${baseFinding.package}`;
    const prFinding = prByBucket.get(bucketKey);
    const baseSet = new Set(baseFinding.advisory_ids);
    const prSet = new Set(prFinding?.advisory_ids || []);
    const removedAdvisories = [...baseSet].filter((id) => !prSet.has(id));
    if (removedAdvisories.length > 0) {
      removed.push({
        ...baseFinding,
        identity: `${baseFinding.severity}:${baseFinding.package}:${removedAdvisories.sort().join('+')}`,
        advisory_ids: removedAdvisories.sort(),
      });
    }
  }

  const severityRank = { high: 2, critical: 3 };
  const severityEscalations = [];
  const baseAdvisoriesByPackage = new Map();
  for (const finding of base.findings) {
    if (!baseAdvisoriesByPackage.has(finding.package)) {
      baseAdvisoriesByPackage.set(finding.package, new Map());
    }
    for (const id of finding.advisory_ids) {
      baseAdvisoriesByPackage.get(finding.package).set(id, finding.severity);
    }
  }
  for (const finding of pr.findings) {
    const baseSeverityByAdvisory = baseAdvisoriesByPackage.get(finding.package) || new Map();
    for (const id of finding.advisory_ids) {
      const baseSeverity = baseSeverityByAdvisory.get(id);
      if (!baseSeverity) {
        continue;
      }
      if ((severityRank[finding.severity] || 0) > (severityRank[baseSeverity] || 0)) {
        severityEscalations.push({
          identity: `${finding.package}:${id}`,
          from: baseSeverity,
          to: finding.severity,
          package: finding.package,
          advisory_id: id,
          surface,
        });
      }
    }
  }

  const baseDirect = new Set(base.directVulnerable);
  const newVulnerableDirect = pr.directVulnerable.filter((d) => !baseDirect.has(d));

  return {
    surface,
    base_high_critical_identities: base.findings.map((f) => f.identity),
    pr_high_critical_identities: pr.findings.map((f) => f.identity),
    introduced_high_critical_identities: introduced.map((f) => f.identity),
    removed_high_critical_identities: removed.map((f) => f.identity),
    severity_escalations: severityEscalations,
    new_vulnerable_direct_dependencies: newVulnerableDirect,
    new_vulnerable_node_paths: [],
    introduced,
    removed,
    exact_identity_introduced: pr.findings.filter((f) => !baseMap.has(f.identity)),
    exact_identity_removed: base.findings.filter((f) => !prMap.has(f.identity)),
  };
}

function main() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--base-backend') opts.baseBackend = args[++i];
    else if (arg === '--base-frontend') opts.baseFrontend = args[++i];
    else if (arg === '--pr-backend') opts.prBackend = args[++i];
    else if (arg === '--pr-frontend') opts.prFrontend = args[++i];
    else if (arg === '--report') opts.report = args[++i];
  }

  const required = ['baseBackend', 'baseFrontend', 'prBackend', 'prFrontend'];
  for (const key of required) {
    if (!opts[key]) {
      console.error(`Missing required argument: --${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`);
      process.exit(2);
    }
  }

  let baseBackendAudit;
  let baseFrontendAudit;
  let prBackendAudit;
  let prFrontendAudit;
  try {
    baseBackendAudit = readJson(opts.baseBackend);
    baseFrontendAudit = readJson(opts.baseFrontend);
    prBackendAudit = readJson(opts.prBackend);
    prFrontendAudit = readJson(opts.prFrontend);
  } catch (err) {
    console.error(`FAIL_CLOSED: ${err.message}`);
    process.exit(2);
  }

  const backend = compareSurface(baseBackendAudit, prBackendAudit, 'backend');
  const frontend = compareSurface(baseFrontendAudit, prFrontendAudit, 'frontend');

  const introducedCritical = [...backend.introduced, ...frontend.introduced].filter(
    (f) => f.severity === 'critical',
  );
  const introducedHigh = [...backend.introduced, ...frontend.introduced].filter(
    (f) => f.severity === 'high',
  );
  const severityEscalations = [...backend.severity_escalations, ...frontend.severity_escalations];
  const newDirect = [
    ...backend.new_vulnerable_direct_dependencies,
    ...frontend.new_vulnerable_direct_dependencies,
  ];

  const report = {
    security_gate_mode: 'BASELINE_REGRESSION_FAIL_CLOSED',
    backend,
    frontend,
    summary: {
      pr_introduced_critical: introducedCritical.length,
      pr_introduced_high: introducedHigh.length,
      pr_severity_escalations: severityEscalations.length,
      pr_new_vulnerable_direct_dependencies: newDirect.length,
      security_regression:
        introducedCritical.length > 0 ||
        introducedHigh.length > 0 ||
        severityEscalations.length > 0 ||
        newDirect.length > 0,
      base_backend_metadata: baseBackendAudit.metadata?.vulnerabilities || null,
      base_frontend_metadata: baseFrontendAudit.metadata?.vulnerabilities || null,
      pr_backend_metadata: prBackendAudit.metadata?.vulnerabilities || null,
      pr_frontend_metadata: prFrontendAudit.metadata?.vulnerabilities || null,
    },
  };

  if (opts.report) {
    fs.writeFileSync(opts.report, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log('=== Dependency baseline regression comparison ===');
  console.log(JSON.stringify(report.summary, null, 2));

  if (report.summary.security_regression) {
    console.error('SECURITY_REGRESSION=true');
    if (introducedCritical.length) {
      console.error('Introduced Critical:', introducedCritical.map((f) => f.identity).join(', '));
    }
    if (introducedHigh.length) {
      console.error('Introduced High:', introducedHigh.map((f) => f.identity).join(', '));
    }
    if (severityEscalations.length) {
      console.error('Severity escalations:', JSON.stringify(severityEscalations));
    }
    if (newDirect.length) {
      console.error('New vulnerable direct dependencies:', newDirect.join(', '));
    }
    process.exit(1);
  }

  console.log('SECURITY_REGRESSION=false');
  process.exit(0);
}

main();
