import type { NextFunction, Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import MediaAsset from '../models/MediaAsset';
import { ErrorCodes, ResponseCodes, StaffRoles, config } from '../config/constants';
import { sendError } from '../utils/apiResponse';
import { signedUrl, usesCloud } from '../utils/fileStorage';
import { Readable } from 'node:stream';

const notFound = (res: Response) =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'File not found', code: ErrorCodes.NOT_FOUND });

// Generated names only (uuid + a known extension). Anything else never reaches the filesystem.
const SAFE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/;

/**
 * @name serveMedia
 * @file MediaController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Streams an uploaded file. Public assets are served to everyone; staff-only assets
 * only to signed-in staff (everyone else gets a plain 404, so their existence is not revealed).
 * Files are sent with their verified type, no sniffing, and a policy that stops them running scripts.
 * @author Ravi Patel
 */
export const serveMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await MediaAsset.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!asset) return notFound(res);

    const isPublic = asset.visibility === 'public';
    const isStaff = Boolean(req.user && StaffRoles.includes(req.user.role));
    if (!isPublic && !isStaff) return notFound(res);
    if (!SAFE_NAME.test(asset.storedName)) return notFound(res);

    const asciiName = asset.originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

    if (usesCloud) {
      const url = signedUrl(asset.storedName, asset.kind);
      // Public files: let the browser fetch them straight from Cloudinary (no function bandwidth).
      if (isPublic) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.redirect(302, url);
      }
      // Staff-only files: stream through the API so the signed URL is never exposed.
      const upstream = await fetch(url);
      if (!upstream.ok || !upstream.body) return notFound(res);
      res.status(ResponseCodes.OK);
      res.setHeader('Content-Type', asset.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Cookie');
      Readable.fromWeb(upstream.body as never).on('error', next).pipe(res);
      return;
    }

    const path = join(config.uploads.dir, asset.storedName);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return notFound(res);

    res.status(ResponseCodes.OK);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('Content-Disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', isPublic ? 'public, max-age=86400' : 'private, no-store');
    if (!isPublic) res.setHeader('Vary', 'Cookie');

    const stream = createReadStream(path);
    stream.on('error', next);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
};
