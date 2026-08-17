#!/usr/bin/env node
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = process.argv[2] || process.cwd();
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));

function semverSatisfies(version, range) {
  try {
    const out = execSync(
      `node -e "const s=require('semver');process.stdout.write(String(s.satisfies(process.argv[1],process.argv[2])))" "${version}" "${range}"`,
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
    return out === 'true';
  } catch {
    return null;
  }
}

function parentPkgJson(parentName) {
  const req = createRequire(join(ROOT, 'package.json'));
  const parentPath = req.resolve(`${parentName}/package.json`);
  return { path: parentPath, json: JSON.parse(readFileSync(parentPath, 'utf8')) };
}

function resolveFromParent(parentName, childName) {
  const { path: parentPkgPath, json: parentJson } = parentPkgJson(parentName);
  const parentVersion = parentJson.version;
  const declared =
    parentJson.dependencies?.[childName] ??
    parentJson.optionalDependencies?.[childName] ??
    parentJson.peerDependencies?.[childName] ??
    null;
  const parentRequire = createRequire(parentPkgPath);
  let resolvedPath;
  let resolvedVersion;
  try {
    resolvedPath = parentRequire.resolve(`${childName}/package.json`);
    resolvedVersion = JSON.parse(readFileSync(resolvedPath, 'utf8')).version;
  } catch {
    resolvedPath = null;
    resolvedVersion = null;
  }

  const lockKey = `node_modules/${parentName}/node_modules/${childName}`;
  const lockNode = lock.packages?.[lockKey];
  const lockVersion = lockNode?.version ?? null;

  return {
    parent: parentName,
    parent_version: parentVersion,
    child: childName,
    parent_declared_range: declared,
    actual_resolved_package_json_path: resolvedPath,
    actual_resolved_version: resolvedVersion,
    semver_satisfies_parent_range:
      resolvedVersion && declared != null ? semverSatisfies(resolvedVersion, String(declared)) : null,
    package_lock_node_path: lockKey,
    package_lock_version: lockVersion,
    lockfile_matches_runtime:
      lockVersion != null && resolvedVersion != null ? lockVersion === resolvedVersion : null,
  };
}

const DEFAULT_EDGES = [
  ['@nestjs/core', 'path-to-regexp'],
  ['@nestjs/swagger', 'path-to-regexp'],
  ['@nestjs/swagger', 'lodash'],
  ['@nestjs/swagger', 'js-yaml'],
  ['express', 'path-to-regexp'],
  ['@nestjs/platform-express', 'multer'],
  ['@nestjs/config', 'lodash'],
];

const edgesArg = process.argv[3];
const edges = edgesArg ? JSON.parse(edgesArg) : DEFAULT_EDGES;

console.log(JSON.stringify({ root: ROOT, edges: edges.map(([p, c]) => resolveFromParent(p, c)) }, null, 2));
