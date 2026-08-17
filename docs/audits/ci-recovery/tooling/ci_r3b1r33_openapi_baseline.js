#!/usr/bin/env node
/** Generate sanitized OpenAPI baseline from built backend dist. */
const { writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join, resolve } = require('node:path');
const { createRequire } = require('node:module');

const backendRoot = resolve(process.argv[2] || process.cwd());
process.chdir(backendRoot);
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://synqdrive:synqdrive@localhost:5432/synqdrive';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'openapi-baseline-secret';

async function main() {
  const backendRequire = createRequire(join(backendRoot, 'package.json'));
  const { NestFactory } = backendRequire('@nestjs/core');
  const { DocumentBuilder, SwaggerModule } = backendRequire('@nestjs/swagger');
  const { AppModule } = backendRequire('./dist/src/app.module');

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.create(appModule, { logger: false });
  const config = new DocumentBuilder().setTitle('SynqDrive API').setVersion('1.0').addBearerAuth().build();
  const document = SwaggerModule.createDocument(app, config);
  await app.close();

  const sanitized = structuredClone(document);
  const json = JSON.stringify(sanitized, null, 2);
  const sha = createHash('sha256').update(json).digest('hex');
  const outArg = process.argv[3];
  const out = outArg
    ? resolve(outArg)
    : join(backendRoot, '..', 'docs', 'audits', 'ci-recovery', 'data', 'ci-r3b1r33-openapi-baseline.json');
  writeFileSync(out, json + '\n');
  console.log(JSON.stringify({ path: out, sha256: sha, paths: Object.keys(sanitized.paths || {}).length }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
