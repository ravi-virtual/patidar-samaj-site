import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import OrganizationSettings from '../models/OrganizationSettings';
import { ErrorCodes, ResponseCodes } from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { PublicTabs, resolvePublicTabs, type PublicTab } from '../config/publicTabs';
import { getSettings } from '../utils/settings';
import { missingMediaIds } from '../utils/media';
import { writeAudit } from '../utils/audit';

type Settings = NonNullable<Awaited<ReturnType<typeof getSettings>>>;

/** The public subset. Nothing about infrastructure or staff is ever part of settings. */
export const toPublicSettings = (s: Settings) => ({
  name: s.name,
  shortName: s.shortName,
  invocation: s.invocation,
  tagline: s.tagline ?? '',
  logoUrl: s.logoMediaId ? `/api/media/${s.logoMediaId}` : null,
  contact: {
    email: s.contact?.email ?? '',
    phone: s.contact?.phone ?? '',
    address: s.contact?.address ?? '',
    officeHours: s.contact?.officeHours ?? '',
  },
  socialLinks: (s.socialLinks ?? []).map((l) => ({ label: l.label, url: l.url })),
  footerNote: s.footerNote ?? '',
  publicTabs: resolvePublicTabs(s.publicTabs),
  themeDefault: s.themeDefault ?? 'system',
});

const toAdminSettings = (s: Settings) => ({
  ...toPublicSettings(s),
  logoMediaId: s.logoMediaId ?? null,
  updatedAt: s.updatedAt,
});

/**
 * @name getPublicSettings
 * @file SettingsController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Organisation name, contact details, footer text and which public tabs are switched on,
 * for the public site header, footer, navigation and contact page.
 * @author Ravi Patel
 */
export const getPublicSettings = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getSettings();
    return new ApiResponse(ResponseCodes.OK, 'Settings fetched successfully', {
      settings: toPublicSettings(settings!),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getAdminSettings
 * @file SettingsController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Settings for the admin form.
 * @author Ravi Patel
 */
export const getAdminSettings = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getSettings();
    return new ApiResponse(ResponseCodes.OK, 'Settings fetched successfully', {
      settings: toAdminSettings(settings!),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateSettings
 * @file SettingsController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Updates organisation details, social links, the default theme and the public
 * tab switches (partial updates allowed). Only the listed fields are accepted. Every change is
 * audited, with before/after values for each public tab that changed.
 * @author Ravi Patel
 */
export const updateSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<{
      name?: string;
      shortName?: string;
      invocation?: string;
      tagline?: string;
      footerNote?: string;
      logoMediaId?: string | null;
      contact?: Record<string, string>;
      socialLinks?: { label: string; url: string }[];
      publicTabs?: Partial<Record<PublicTab, boolean>>;
      themeDefault?: string;
    }>(req, { locations: ['body'], includeOptionals: false });

    if (data.logoMediaId && (await missingMediaIds([data.logoMediaId], 'image')).length) {
      return sendError(res, {
        statusCode: ResponseCodes.BAD_REQUEST,
        message: 'Validation failed',
        code: ErrorCodes.VALIDATION_ERROR,
        details: [{ field: 'logoMediaId', message: 'That image does not exist' }],
      });
    }

    const before = await getSettings();
    const { contact, publicTabs, ...rest } = data;
    const $set: Record<string, unknown> = { ...rest };
    for (const [k, v] of Object.entries(contact ?? {})) $set[`contact.${k}`] = v;
    for (const [k, v] of Object.entries(publicTabs ?? {})) $set[`publicTabs.${k}`] = v;
    const tabsBefore = resolvePublicTabs(before?.publicTabs);
    const tabChanges = Object.fromEntries(
      PublicTabs.filter((tab) => publicTabs?.[tab] !== undefined && publicTabs[tab] !== tabsBefore[tab]).map((tab) => [
        tab,
        { from: tabsBefore[tab], to: publicTabs![tab] },
      ]),
    );

    const updated = await OrganizationSettings.findOneAndUpdate({ key: 'main' }, { $set }, { returnDocument: 'after', upsert: true }).lean();
    await writeAudit(req, {
      action: 'settings.updated',
      targetType: 'settings',
      metadata: {
        fields: Object.keys($set),
        ...(Object.keys(tabChanges).length ? { publicTabs: tabChanges } : {}),
      },
    });
    return new ApiResponse(ResponseCodes.OK, 'Settings saved', { settings: toAdminSettings(updated!) }).send(res);
  } catch (err) {
    return next(err);
  }
};
