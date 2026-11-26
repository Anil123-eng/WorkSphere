export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

export type PaginationResult =
  | { success: true; pagination: Pagination }
  | { success: false; message: string };

function parseInteger(
  value: unknown,
  name: "page" | "limit",
  defaultValue: number
): number | PaginationResult {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return { success: false, message: `${name} must be a positive integer` };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { success: false, message: `${name} must be a positive integer` };
  }

  if (name === "limit" && parsed > MAX_PAGE_SIZE) {
    return {
      success: false,
      message: `limit must not exceed ${MAX_PAGE_SIZE}`,
    };
  }

  return parsed;
}

export function parsePagination(
  pageValue: unknown,
  limitValue: unknown
): PaginationResult {
  const page = parseInteger(pageValue, "page", DEFAULT_PAGE);
  if (typeof page !== "number") {
    return page;
  }

  const limit = parseInteger(limitValue, "limit", DEFAULT_PAGE_SIZE);
  if (typeof limit !== "number") {
    return limit;
  }

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) {
    return { success: false, message: "page is too large" };
  }

  return { success: true, pagination: { page, limit, offset } };
}

export function createPaginationMetadata(
  page: number,
  limit: number,
  total: number
) {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}
