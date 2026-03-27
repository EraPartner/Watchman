/**
 * Pagination Utilities
 *
 * Provides pagination helpers for API endpoints returning large lists.
 * Supports offset-based and cursor-based pagination.
 *
 * @fileoverview Pagination utilities for API responses
 * @author Watchman Team
 * @version 1.0.0
 */

/**
 * Pagination options
 * @typedef {Object} PaginationOptions
 * @property {number} [page=1] - Current page number (1-indexed)
 * @property {number} [limit=20] - Items per page (max 100)
 * @property {string} [sortBy] - Field to sort by
 * @property {string} [sortOrder="asc"] - Sort order ("asc" or "desc")
 */

/**
 * Paginate an array of items
 * @param {any[]} items - Array to paginate
 * @param {PaginationOptions} options - Pagination options
 * @returns {Object} Paginated result
 */
export function paginate(items, options = {}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const sortBy = options.sortBy;
  const sortOrder =
    options.sortOrder?.toLowerCase() === "desc" ? "desc" : "asc";

  // Sort if needed
  let sortedItems = items;
  if (sortBy) {
    sortedItems = [...items].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortOrder === "desc" ? -comparison : comparison;
    });
  }

  const totalItems = sortedItems.length;
  const totalPages = Math.ceil(totalItems / limit);
  const offset = (page - 1) * limit;
  const paginatedItems = sortedItems.slice(offset, offset + limit);

  return {
    data: paginatedItems,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Cursor-based pagination for stable pagination with changing data
 * @param {any[]} items - Array to paginate
 * @param {string} cursorField - Field to use as cursor
 * @param {PaginationOptions} options - Pagination options
 * @returns {Object} Cursor-paginated result
 */
export function paginateWithCursor(items, cursorField, options = {}) {
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const cursor = options.cursor;
  const sortBy = options.sortBy || cursorField;
  const sortOrder =
    options.sortOrder?.toLowerCase() === "desc" ? "desc" : "asc";

  // Sort items
  let sortedItems = [...items].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];

    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    const comparison = aVal < bVal ? -1 : 1;
    return sortOrder === "desc" ? -comparison : comparison;
  });

  // Filter after cursor
  if (cursor) {
    const cursorIndex = sortedItems.findIndex((item) => {
      return String(item[cursorField]) === String(cursor);
    });
    if (cursorIndex >= 0) {
      sortedItems = sortedItems.slice(cursorIndex + 1);
    }
  }

  const paginatedItems = sortedItems.slice(0, limit);
  const nextCursor =
    paginatedItems.length > 0
      ? paginatedItems[paginatedItems.length - 1][cursorField]
      : null;

  return {
    data: paginatedItems,
    pagination: {
      limit,
      nextCursor,
      hasMore: sortedItems.length > limit,
    },
  };
}

/**
 * Express middleware for parsing pagination query params
 * @param {Object} options - Configuration options
 * @param {string} [options.pageParam="page"] - Query param for page
 * @param {string} [options.limitParam="limit"] - Query param for limit
 * @param {number} [options.defaultLimit=20] - Default items per page
 * @param {number} [options.maxLimit=100] - Maximum allowed limit
 * @returns {Function} Express middleware
 */
export function parsePagination(options = {}) {
  const pageParam = options.pageParam || "page";
  const limitParam = options.limitParam || "limit";
  const defaultLimit = options.defaultLimit || 20;
  const maxLimit = options.maxLimit || 100;

  return (req, res, next) => {
    const page = parseInt(req.query[pageParam], 10) || 1;
    const limit = Math.min(
      maxLimit,
      parseInt(req.query[limitParam], 10) || defaultLimit
    );

    req.pagination = {
      page: Math.max(1, page),
      limit: Math.max(1, limit),
      sortBy: req.query.sortBy || null,
      sortOrder: req.query.sortOrder || "asc",
      cursor: req.query.cursor || null,
    };

    next();
  };
}
