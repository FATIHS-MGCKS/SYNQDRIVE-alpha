import { BadRequestException } from '@nestjs/common';
import { CORE_READ_VEHICLES_MAX_PAGE_SIZE } from './core-read-vehicles.constants';

const MAX_SAFE_SKIP = Number.MAX_SAFE_INTEGER;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

export type CoreReadPagination = {
  page: number;
  pageSize: number;
  skip: number;
};

/**
 * Strict query parsing for M2M vehicle list pagination.
 * Rejects malformed, negative, non-integer, and overflow skip combinations.
 */
export function parseCoreReadPagination(
  pageRaw: string | undefined,
  pageSizeRaw: string | undefined,
): CoreReadPagination {
  const page = parseOptionalPositiveInt(pageRaw, DEFAULT_PAGE, 'page');
  const pageSize = parseOptionalPositiveInt(pageSizeRaw, DEFAULT_PAGE_SIZE, 'pageSize', {
    max: CORE_READ_VEHICLES_MAX_PAGE_SIZE,
  });

  const skip = (page - 1) * pageSize;
  if (skip > MAX_SAFE_SKIP) {
    throw new BadRequestException('Invalid pagination parameters');
  }

  return { page, pageSize, skip };
}

function parseOptionalPositiveInt(
  raw: string | undefined,
  defaultValue: number,
  field: 'page' | 'pageSize',
  opts?: { max?: number },
): number {
  if (raw === undefined) {
    return defaultValue;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  if (opts?.max != null && value > opts.max) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return value;
}