import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import CommitteeMember from '../models/CommitteeMember';
import CommitteeTerm from '../models/CommitteeTerm';
import ContentBlock, { ContentKeys, type ContentKey } from '../models/ContentBlock';
import { ContentResources, type ContentResource } from '../config/contentResources';
import { ErrorCodes, PublishStatus, ResponseCodes } from '../config/constants';
import { Permissions } from '../config/permissions';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { mayEditItem } from '../utils/publishPolicy';
import { missingMediaIds } from '../utils/media';
import { writeAudit } from '../utils/audit';
import { blockView } from './ContentController';

type Row = Record<string, unknown> & { _id: string; status: string };

const resourceOf = (req: Request): { name: string; resource: ContentResource } => {
  const name = String(req.params.resource);
  return { name, resource: ContentResources[name]! };
};

const notFound = (res: Response, what: string) =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: `${what} not found`, code: ErrorCodes.NOT_FOUND });

const forbidden = (res: Response, message: string) =>
  sendError(res, { statusCode: ResponseCodes.FORBIDDEN, message, code: ErrorCodes.FORBIDDEN });

const conflict = (res: Response, message: string, code: (typeof ErrorCodes)[keyof typeof ErrorCodes] = ErrorCodes.DUPLICATE) =>
  sendError(res, { statusCode: ResponseCodes.CONFLICT, message, code });

const invalid = (res: Response, field: string, message: string) =>
  sendError(res, {
    statusCode: ResponseCodes.BAD_REQUEST,
    message: 'Validation failed',
    code: ErrorCodes.VALIDATION_ERROR,
    details: [{ field, message }],
  });

const adminView = (doc: Row, resource: ContentResource) => ({
  id: doc._id,
  ...Object.fromEntries(resource.writableFields.map((f) => [f, doc[f] ?? null])),
  status: doc.status,
  order: doc.order ?? 0,
  publishedAt: doc.publishedAt ?? null,
  createdBy: doc.createdBy ?? null,
  updatedBy: doc.updatedBy ?? null,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/** Checks references that depend on other records: media ids, committee term, link target. */
const checkReferences = async (name: string, resource: ContentResource, merged: Record<string, unknown>) => {
  const imageFields = resource.mediaFields.filter((f) => f !== 'fileMediaId');
  const missingImages = await missingMediaIds(imageFields.map((f) => merged[f] as string | undefined), 'image');
  if (missingImages.length) return { field: imageFields[0] ?? 'image', message: 'That image does not exist' };

  if (merged.fileMediaId) {
    if ((await missingMediaIds([merged.fileMediaId as string], 'document')).length) {
      return { field: 'fileMediaId', message: 'That document does not exist' };
    }
  }
  if (name === 'links' && !merged.url && !merged.fileMediaId) {
    return { field: 'url', message: 'Give a web address or attach a document' };
  }
  if (name === 'links' && merged.url && merged.fileMediaId) {
    return { field: 'url', message: 'Use either a web address or a document, not both' };
  }
  if (name === 'committee-members') {
    const term = await CommitteeTerm.exists({ _id: merged.termId as string, isDeleted: false });
    if (!term) return { field: 'termId', message: 'That committee term does not exist' };
  }
  return null;
};

/**
 * @name listItems
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Staff list of one content type in every status, with search and filters.
 * @author Ravi Patel
 */
export const listItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resource } = resourceOf(req);
    const q = matchedData<{ page?: number; limit?: number; status?: string; search?: string } & Record<string, string>>(
      req,
      { locations: ['query'] },
    );
    const filter: Record<string, unknown> = { isDeleted: false };
    if (q.status) filter.status = q.status;
    for (const field of resource.filterFields) if (q[field]) filter[field] = q[field];
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = resource.searchFields.map((f) => ({ [f]: rx }));
    }
    const { limit, skip } = pageParams(q, 50);
    const [items, totalCount] = await Promise.all([
      resource.model.find(filter).sort(resource.sort).skip(skip).limit(limit).lean() as Promise<Row[]>,
      resource.model.countDocuments(filter),
    ]);
    return new ApiResponse(ResponseCodes.OK, `${resource.label}s fetched successfully`, {
      items: items.map((i) => adminView(i, resource)),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getItem
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description One item of any status, for the staff editor.
 * @author Ravi Patel
 */
export const getItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resource } = resourceOf(req);
    const item = (await resource.model.findOne({ _id: req.params.id, isDeleted: false }).lean()) as Row | null;
    if (!item) return notFound(res, resource.label);
    return new ApiResponse(ResponseCodes.OK, `${resource.label} fetched successfully`, {
      item: adminView(item, resource),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name createItem
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Creates a draft item at the end of the list. Only the fields listed for that
 * content type are read from the request; status and order are set by the server.
 * @author Ravi Patel
 */
export const createItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, resource } = resourceOf(req);
    const data = matchedData<Record<string, unknown>>(req, { locations: ['body'], includeOptionals: false });
    const fields = Object.fromEntries(Object.entries(data).filter(([k]) => resource.writableFields.includes(k)));

    const problem = await checkReferences(name, resource, fields);
    if (problem) return invalid(res, problem.field, problem.message);

    const last = (await resource.model.findOne({ isDeleted: false }).sort({ order: -1 }).select('order').lean()) as
      | { order?: number }
      | null;
    const item = await resource.model.create({
      ...fields,
      status: PublishStatus.DRAFT,
      order: (last?.order ?? -1) + 1,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });
    await writeAudit(req, { action: `content.${name}.created`, targetType: name, targetId: item._id });
    return new ApiResponse(ResponseCodes.CREATED, `${resource.label} saved as a draft`, {
      item: adminView(item.toObject() as Row, resource),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateItem
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Edits an item. Without content.publish only drafts can be edited.
 * @author Ravi Patel
 */
export const updateItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, resource } = resourceOf(req);
    const data = matchedData<Record<string, unknown>>(req, { locations: ['body'], includeOptionals: false });
    const fields = Object.fromEntries(Object.entries(data).filter(([k]) => resource.writableFields.includes(k)));

    const item = await resource.model.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, resource.label);
    if (!mayEditItem(req.user, item.status, Permissions.CONTENT_PUBLISH)) {
      return forbidden(res, 'Only staff who can publish content may change something that is already live');
    }

    const merged = { ...(item.toObject() as Record<string, unknown>), ...fields };
    const problem = await checkReferences(name, resource, merged);
    if (problem) return invalid(res, problem.field, problem.message);

    if (name === 'committee-terms' && fields.isCurrent === true && !req.user!.permissions.includes(Permissions.CONTENT_PUBLISH)) {
      return forbidden(res, 'Only staff who can publish content may mark the current committee term');
    }

    item.set({ ...fields, updatedBy: req.user!.id });
    await item.save();
    if (name === 'committee-terms' && fields.isCurrent === true) {
      await CommitteeTerm.updateMany({ _id: { $ne: item._id } }, { $set: { isCurrent: false } });
    }
    await writeAudit(req, {
      action: `content.${name}.updated`,
      targetType: name,
      targetId: item._id,
      metadata: { fields: Object.keys(fields) },
    });
    return new ApiResponse(ResponseCodes.OK, `${resource.label} updated`, {
      item: adminView(item.toObject() as Row, resource),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

const setStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
  opts: { from: string[]; to: string; action: string; message: string },
) => {
  try {
    const { name, resource } = resourceOf(req);
    const item = await resource.model.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, resource.label);
    if (!opts.from.includes(item.status)) return conflict(res, `An item that is ${item.status} cannot be changed this way.`);

    item.status = opts.to;
    if (opts.to === PublishStatus.PUBLISHED) item.publishedAt = new Date();
    item.updatedBy = req.user!.id;
    await item.save();
    if (name === 'committee-terms' && opts.to === PublishStatus.PUBLISHED && item.isCurrent) {
      await CommitteeTerm.updateMany({ _id: { $ne: item._id } }, { $set: { isCurrent: false } });
    }
    await writeAudit(req, { action: `content.${name}.${opts.action}`, targetType: name, targetId: item._id });
    return new ApiResponse(ResponseCodes.OK, opts.message, { item: adminView(item.toObject() as Row, resource) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name publishItem
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Makes a draft or archived item visible on the public site (content.publish).
 * @author Ravi Patel
 */
export const publishItem = (req: Request, res: Response, next: NextFunction) =>
  setStatus(req, res, next, {
    from: [PublishStatus.DRAFT, PublishStatus.ARCHIVED],
    to: PublishStatus.PUBLISHED,
    action: 'published',
    message: 'Published',
  });

/**
 * @name unpublishItem
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Returns a published or archived item to draft so it disappears from the site.
 * @author Ravi Patel
 */
export const unpublishItem = (req: Request, res: Response, next: NextFunction) =>
  setStatus(req, res, next, {
    from: [PublishStatus.PUBLISHED, PublishStatus.ARCHIVED],
    to: PublishStatus.DRAFT,
    action: 'unpublished',
    message: 'Unpublished',
  });

/**
 * @name archiveItem
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Retires a published item without deleting it.
 * @author Ravi Patel
 */
export const archiveItem = (req: Request, res: Response, next: NextFunction) =>
  setStatus(req, res, next, {
    from: [PublishStatus.PUBLISHED],
    to: PublishStatus.ARCHIVED,
    action: 'archived',
    message: 'Archived',
  });

/**
 * @name reorderItems
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Sets the display order to the order of the given ids.
 * @author Ravi Patel
 */
export const reorderItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, resource } = resourceOf(req);
    const { ids } = matchedData<{ ids: string[] }>(req, { locations: ['body'] });
    const result = await resource.model.bulkWrite(
      ids.map((id, index) => ({ updateOne: { filter: { _id: id, isDeleted: false }, update: { $set: { order: index } } } })),
    );
    await writeAudit(req, { action: `content.${name}.reordered`, metadata: { count: ids.length } });
    return new ApiResponse(ResponseCodes.OK, 'Order saved', { updated: result.modifiedCount }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name deleteItem
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Soft-deletes an item. A committee term that still has members cannot be deleted.
 * @author Ravi Patel
 */
export const deleteItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, resource } = resourceOf(req);
    const item = await resource.model.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res, resource.label);
    if (name === 'committee-terms' && (await CommitteeMember.exists({ termId: item._id, isDeleted: false }))) {
      return conflict(res, 'This term still has committee members. Remove them first.', ErrorCodes.HAS_DEPENDENCIES);
    }
    item.isDeleted = true;
    await item.save();
    await writeAudit(req, { action: `content.${name}.deleted`, targetType: name, targetId: item._id });
    return new ApiResponse(ResponseCodes.OK, `${resource.label} deleted`).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name listAdminBlocks
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Every editable text block, including ones that have not been written yet.
 * @author Ravi Patel
 */
export const listAdminBlocks = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const blocks = await ContentBlock.find({ isDeleted: false }).lean();
    const byKey = new Map(blocks.map((b) => [b.key, b]));
    return new ApiResponse(ResponseCodes.OK, 'Content fetched successfully', {
      blocks: ContentKeys.map((key) => {
        const b = byKey.get(key);
        return b ? { ...blockView(b), status: b.status, publishedAt: b.publishedAt ?? null, updatedAt: b.updatedAt } : { key, status: 'empty' };
      }),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name saveBlock
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Creates or edits a text block. New blocks start as drafts. Without content.publish a
 * block that is already live cannot be changed.
 * @author Ravi Patel
 */
export const saveBlock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = String(req.params.key) as ContentKey;
    const data = matchedData<{
      title?: string | null;
      body?: string | null;
      items?: Record<string, unknown>[];
    }>(req, { locations: ['body'], includeOptionals: false });

    const missing = await missingMediaIds((data.items ?? []).map((i) => i.imageMediaId as string | undefined), 'image');
    if (missing.length) return invalid(res, 'items', 'One of the images does not exist');

    const existing = await ContentBlock.findOne({ key, isDeleted: false });
    if (existing && !mayEditItem(req.user, existing.status, Permissions.CONTENT_PUBLISH)) {
      return forbidden(res, 'Only staff who can publish content may change content that is already live');
    }
    const block = existing ?? new ContentBlock({ key, status: PublishStatus.DRAFT, createdBy: req.user!.id });
    block.set({ ...data, updatedBy: req.user!.id });
    await block.save();
    await writeAudit(req, { action: 'content.block.saved', targetType: 'content-block', targetId: block._id, metadata: { key } });
    return new ApiResponse(ResponseCodes.OK, 'Saved', {
      block: { ...blockView(block.toObject()), status: block.status },
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

const blockStatus = async (req: Request, res: Response, next: NextFunction, to: string, action: string) => {
  try {
    const block = await ContentBlock.findOne({ key: String(req.params.key) as ContentKey, isDeleted: false });
    if (!block) return notFound(res, 'Content block');
    if (block.status === to) return conflict(res, `This content is already ${to}.`);
    block.status = to as typeof block.status;
    if (to === PublishStatus.PUBLISHED) block.publishedAt = new Date();
    block.updatedBy = req.user!.id;
    await block.save();
    await writeAudit(req, { action: `content.block.${action}`, targetType: 'content-block', targetId: block._id, metadata: { key: block.key } });
    return new ApiResponse(ResponseCodes.OK, to === PublishStatus.PUBLISHED ? 'Published' : 'Unpublished', {
      block: { ...blockView(block.toObject()), status: block.status },
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name publishBlock
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Makes a text block visible on the public site (content.publish).
 * @author Ravi Patel
 */
export const publishBlock = (req: Request, res: Response, next: NextFunction) =>
  blockStatus(req, res, next, PublishStatus.PUBLISHED, 'published');

/**
 * @name unpublishBlock
 * @file ContentAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Takes a text block off the public site without deleting it.
 * @author Ravi Patel
 */
export const unpublishBlock = (req: Request, res: Response, next: NextFunction) =>
  blockStatus(req, res, next, PublishStatus.DRAFT, 'unpublished');
