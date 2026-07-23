import { useMemo, useState } from 'react';
import type { RentalVehicleCategoryDto } from './rental-rules.types';
import {
  filterMatrixCategories,
  paginateMatrixCategories,
  sortMatrixCategories,
  type RentalRulesMatrixFilters,
  type RentalRulesMatrixSortDir,
  type RentalRulesMatrixSortKey,
  type RentalRulesStatusFilter,
} from './rental-rules-matrix.utils';

const DEFAULT_PAGE_SIZE = 12;

export function useRentalRulesMatrix(categories: RentalVehicleCategoryDto[]) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RentalRulesStatusFilter>('ALL');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [sortKey, setSortKey] = useState<RentalRulesMatrixSortKey>('name');
  const [sortDir, setSortDir] = useState<RentalRulesMatrixSortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);

  const filters: RentalRulesMatrixFilters = useMemo(
    () => ({ search, status, incompleteOnly }),
    [search, status, incompleteOnly],
  );

  const filtered = useMemo(
    () => filterMatrixCategories(categories, filters),
    [categories, filters],
  );

  const sorted = useMemo(
    () => sortMatrixCategories(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  );

  const pagination = useMemo(
    () => paginateMatrixCategories(sorted, page, pageSize),
    [sorted, page, pageSize],
  );

  const toggleSort = (key: RentalRulesMatrixSortKey) => {
    setPage(1);
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('ALL');
    setIncompleteOnly(false);
    setPage(1);
  };

  const filtersActive = Boolean(search.trim()) || status !== 'ALL' || incompleteOnly;

  return {
    search,
    setSearch,
    status,
    setStatus,
    incompleteOnly,
    setIncompleteOnly,
    sortKey,
    sortDir,
    toggleSort,
    page,
    setPage,
    pageSize,
    filtersActive,
    clearFilters,
    filteredCount: filtered.length,
    rows: pagination.items,
    total: pagination.total,
    pageCount: pagination.pageCount,
    currentPage: pagination.page,
  };
}
