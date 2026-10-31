import type { NextFunction, Request, Response } from 'express';
import { ErrorCodes, ResponseCodes } from '../config/constants';
import { resolvePublicTabs, type PublicTab } from '../config/publicTabs';
import { sendError } from '../utils/apiResponse';
import { getSettings } from '../utils/settings';

/** Whether a public tab is switched on in the organisation settings. */
export const isTabEnabled = async (tab: PublicTab): Promise<boolean> => resolvePublicTabs((await getSettings())?.publicTabs)[tab];

/**
 * Answers 404 (the normal not-found response) when an administrator has switched the given public
 * tab off. Use it only on public routes; admin routes must never be gated so staff can keep
 * managing hidden tabs.
 */
const requireTab = (tab: PublicTab) => async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (await isTabEnabled(tab)) return next();
    return sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'Not found', code: ErrorCodes.NOT_FOUND });
  } catch (err) {
    return next(err);
  }
};

export default requireTab;
