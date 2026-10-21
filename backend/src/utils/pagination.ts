import { query } from 'express-validator';

/** Query rules for ?page=&limit=. Cap keeps a single request from pulling the whole collection. */
export const paginationRules = (maxLimit = 50) => [
  query('page').optional().isInt({ min: 1, max: 100000 }).withMessage('page must be a positive integer').toInt(),
  query('limit').optional().isInt({ min: 1, max: maxLimit }).withMessage(`limit must be 1–${maxLimit}`).toInt(),
];

export const pageParams = (q: { page?: number; limit?: number }, defaultLimit = 20) => {
  const page = q.page ?? 1;
  const limit = q.limit ?? defaultLimit;
  return { page, limit, skip: (page - 1) * limit };
};
