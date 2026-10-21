import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import MediaAsset, { type IMediaAsset } from '../models/MediaAsset';
import { ErrorCodes, ResponseCodes, config } from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { detectFileType } from '../utils/fileType';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { findMediaReferences } from '../utils/mediaReferences';
import { writeAudit } from '../utils/audit';

const bad = (res: Response, message: string, field = 'file') =>
  sendError(res, {
    statusCode: ResponseCodes.BAD_REQUEST,
    message,
    code: ErrorCodes.VALIDATION_ERROR,
    details: [{ field, message }],
  });

const notFound = (res: Response) =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'File not found', code: ErrorCodes.NOT_FOUND });

/** Display name only. Never used to build a path: files are stored under a generated name. */
const cleanOriginalName = (name: string): string =>
  basename(name.replace(/\\/g, '/'))
    // eslint-disable-next-line no-control-regex -- strip control characters from a display name
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .trim()
    .slice(0, 200) || 'file';

const toView = (a: IMediaAsset) => ({
  id: a._id,
  url: `/api/media/${a._id}`,
  name: a.originalName,
  mimeType: a.mimeType,
  size: a.size,
  kind: a.kind,
  altText: a.altText ?? null,
  visibility: a.visibility,
  createdAt: a.createdAt,
});

/**
 * @name uploadMedia
 * @file MediaAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Accepts one JPEG, PNG, WebP or PDF. The type is decided from the file's own bytes,
 * the extension is taken from that (not from the upload), the stored name is generated, and the
 * file goes to a folder outside the web root. Size limits differ for images and documents.
 * @author Ravi Patel
 */
export const uploadMedia = async (req: Request, res: Response, next: NextFunction) => {
  let writtenPath: string | null = null;
  try {
    const file = req.file;
    if (!file || file.size === 0) return bad(res, 'Choose a file to upload');

    const detected = detectFileType(file.buffer);
    if (!detected) return bad(res, 'Only JPEG, PNG, WebP images and PDF documents are accepted');
    if (file.mimetype !== detected.mime) {
      return bad(res, 'The file’s content does not match its type, so it was not accepted');
    }
    const limit = detected.kind === 'image' ? config.uploads.maxImageBytes : config.uploads.maxDocumentBytes;
    if (file.size > limit) {
      return sendError(res, {
        statusCode: ResponseCodes.PAYLOAD_TOO_LARGE,
        message: `${detected.kind === 'image' ? 'Images' : 'Documents'} can be at most ${Math.round(limit / 1048576)} MB`,
        code: ErrorCodes.PAYLOAD_TOO_LARGE,
      });
    }

    const { altText, visibility } = matchedData<{ altText?: string; visibility?: 'public' | 'private' }>(req, {
      locations: ['body'],
    });
    const storedName = `${randomUUID()}.${detected.ext}`;
    await mkdir(config.uploads.dir, { recursive: true });
    writtenPath = join(config.uploads.dir, storedName);
    await writeFile(writtenPath, file.buffer, { flag: 'wx', mode: 0o640 });

    const asset = await MediaAsset.create({
      storedName,
      originalName: cleanOriginalName(file.originalname),
      mimeType: detected.mime,
      size: file.size,
      kind: detected.kind,
      altText,
      visibility: visibility ?? 'public',
      uploadedBy: req.user!.id,
    });
    writtenPath = null; // kept

    await writeAudit(req, {
      action: 'media.uploaded',
      targetType: 'media',
      targetId: asset._id,
      metadata: { kind: detected.kind, size: file.size },
    });
    return new ApiResponse(ResponseCodes.CREATED, 'File uploaded', { media: toView(asset.toObject()) }).send(res);
  } catch (err) {
    if (writtenPath) await unlink(writtenPath).catch(() => undefined); // no orphan file if the record failed
    return next(err);
  }
};

/**
 * @name listMedia
 * @file MediaAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description The media library for staff, newest first.
 * @author Ravi Patel
 */
export const listMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<{ page?: number; limit?: number; kind?: string; search?: string }>(req, {
      locations: ['query'],
    });
    const filter: Record<string, unknown> = { isDeleted: false };
    if (q.kind) filter.kind = q.kind;
    if (q.search) filter.originalName = new RegExp(escapeRegex(q.search), 'i');
    const { limit, skip } = pageParams(q, 24);
    const [items, totalCount] = await Promise.all([
      MediaAsset.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MediaAsset.countDocuments(filter),
    ]);
    return new ApiResponse(ResponseCodes.OK, 'Files fetched successfully', {
      media: items.map(toView),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateMedia
 * @file MediaAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Edits a file's description (alt text) and whether it is public or staff-only. The
 * file itself is replaced by uploading a new one and pointing the record at it.
 * @author Ravi Patel
 */
export const updateMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<{ altText?: string | null; visibility?: 'public' | 'private' }>(req, {
      locations: ['body'],
      includeOptionals: false,
    });
    const asset = await MediaAsset.findOne({ _id: req.params.id, isDeleted: false });
    if (!asset) return notFound(res);
    asset.set(data);
    await asset.save();
    await writeAudit(req, { action: 'media.updated', targetType: 'media', targetId: asset._id, metadata: { fields: Object.keys(data) } });
    return new ApiResponse(ResponseCodes.OK, 'File updated', { media: toView(asset.toObject()) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name deleteMedia
 * @file MediaAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Removes a file — only if nothing still uses it. Otherwise it explains where it is
 * in use, so a shared image can never be pulled out from under another page.
 * @author Ravi Patel
 */
export const deleteMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await MediaAsset.findOne({ _id: req.params.id, isDeleted: false });
    if (!asset) return notFound(res);

    const uses = await findMediaReferences(asset._id);
    if (uses.length) {
      return sendError(res, {
        statusCode: ResponseCodes.CONFLICT,
        message: `This file is still used by: ${uses.join(', ')}. Replace it there first.`,
        code: ErrorCodes.HAS_DEPENDENCIES,
      });
    }

    asset.isDeleted = true;
    await asset.save();
    await unlink(join(config.uploads.dir, asset.storedName)).catch(() => undefined);
    await writeAudit(req, { action: 'media.deleted', targetType: 'media', targetId: asset._id });
    return new ApiResponse(ResponseCodes.OK, 'File deleted').send(res);
  } catch (err) {
    return next(err);
  }
};
