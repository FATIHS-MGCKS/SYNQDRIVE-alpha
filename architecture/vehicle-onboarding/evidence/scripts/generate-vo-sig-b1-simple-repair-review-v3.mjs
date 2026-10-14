#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGeneratedSql } from './vo-sig-b1-simple-repair-sql-generator-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

writeGeneratedSql(
  resolve(process.argv[2] ?? `${__dirname}/../vo-sig-b1-production-dry-run-manifest.json`),
  resolve(process.argv[3] ?? `${__dirname}/../VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V3.sql`),
  3,
);
