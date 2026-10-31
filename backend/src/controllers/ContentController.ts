import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import CommitteeMember from '../models/CommitteeMember';
import CommitteeTerm from '../models/CommitteeTerm';
import ContentBlock, { type ContentKey, type IContentBlock, type IContentItem } from '../models/ContentBlock';
import { ContentResources, translatedFieldsOf } from '../config/contentResources';
import { ErrorCodes, PublishStatus, ResponseCodes } from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { localizeFields } from '../utils/localize';
import type { Language } from '../i18n/translate';

type Row = Record<string, unknown> & { _id: string };

/**
 * Builds a public response object from an allowlist of fields, in the visitor's language: a field
 * with a Gujarati twin in the list (`question` + `questionGu`) shows the Gujarati text when there is
 * some. The twins themselves are never part of the result.
 */
export const pick = (doc: Row, fields: readonly string[], lang: Language = 'en') =>
  localizeFields(
    { id: doc._id, ...Object.fromEntries(fields.map((f) => [f, doc[f] ?? null])) },
    translatedFieldsOf(fields),
    lang,
  );

/**
 * @name listContent
 * @file ContentController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Published items of one content type (FAQs, important links, history milestones,
 * committee terms or members), in their display order. Drafts and archived items never appear.
 * @author Ravi Patel
 */
export const listContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resource = ContentResources[String(req.params.resource)]!;
    const q = matchedData<{ category?: string; termId?: string }>(req, { locations: ['query'] });
    const filter: Record<string, unknown> = { isDeleted: false, status: PublishStatus.PUBLISHED };
    for (const field of resource.filterFields) {
      const value = q[field as keyof typeof q];
      if (value) filter[field] = value;
    }
    const items = (await resource.model.find(filter).sort(resource.sort).limit(500).lean()) as Row[];
    return new ApiResponse(ResponseCodes.OK, `${resource.label}s fetched successfully`, {
      items: items.map((i) => pick(i, resource.publicFields, req.lang)),
      totalCount: items.length,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getCommittee
 * @file ContentController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description The Committee page in one call: all published terms, the chosen term (the one
 * flagged current, else the most recent) and its published members. No period is hard-coded.
 * @author Ravi Patel
 */
export const getCommittee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wanted = typeof req.query.termId === 'string' ? req.query.termId : undefined;
    const terms = (await CommitteeTerm.find({ isDeleted: false, status: PublishStatus.PUBLISHED })
      .sort({ startYear: -1 })
      .lean()) as unknown as Row[];

    const term =
      terms.find((t) => t._id === wanted) ?? terms.find((t) => t.isCurrent === true) ?? terms[0] ?? null;
    const members = term
      ? ((await CommitteeMember.find({ termId: term._id, isDeleted: false, status: PublishStatus.PUBLISHED })
          .sort({ order: 1, createdAt: 1 })
          .lean()) as unknown as Row[])
      : [];

    const termFields = ContentResources['committee-terms']!.publicFields;
    const memberFields = ContentResources['committee-members']!.publicFields;
    return new ApiResponse(ResponseCodes.OK, 'Committee fetched successfully', {
      terms: terms.map((t) => pick(t, termFields, req.lang)),
      term: term ? pick(term, termFields, req.lang) : null,
      members: members.map((m) => pick(m, memberFields, req.lang)),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

type BlockSource = Pick<IContentBlock, '_id' | 'key' | 'title' | 'body' | 'titleGu' | 'bodyGu'> & { items?: IContentItem[] };

/** A block in both languages (the `*Gu` twins included, items too). This is the staff (admin) view. */
const blockView = (b: BlockSource) => ({
  id: b._id,
  key: b.key,
  title: b.title ?? null,
  titleGu: b.titleGu ?? null,
  body: b.body ?? null,
  bodyGu: b.bodyGu ?? null,
  items: (b.items ?? []).map((i: IContentItem) => ({
    title: i.title ?? null,
    titleGu: i.titleGu ?? null,
    text: i.text ?? null,
    textGu: i.textGu ?? null,
    value: i.value ?? null,
    label: i.label ?? null,
    labelGu: i.labelGu ?? null,
    imageMediaId: i.imageMediaId ?? null,
  })),
});

/** A block in the visitor's language, block text and every item localized, with no `*Gu` keys. */
const publicBlockView = (b: BlockSource, lang: Language) => {
  const view = blockView(b);
  return {
    ...localizeFields(view, ['title', 'body'], lang),
    items: view.items.map((i) => localizeFields(i, ['title', 'text', 'label'], lang)),
  };
};

/**
 * @name listBlocks
 * @file ContentController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Every published text block (home welcome, community statistics, about sections,
 * history introduction) keyed by name, so a page needs one request.
 * @author Ravi Patel
 */
export const listBlocks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blocks = await ContentBlock.find({ isDeleted: false, status: PublishStatus.PUBLISHED }).lean();
    return new ApiResponse(ResponseCodes.OK, 'Content fetched successfully', {
      blocks: Object.fromEntries(blocks.map((b) => [b.key, publicBlockView(b, req.lang)])),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getBlock
 * @file ContentController.ts
 * @param {Request} req
 * @param {Response} res
 * @description One published text block by key.
 * @author Ravi Patel
 */
export const getBlock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const block = await ContentBlock.findOne({
      key: String(req.params.key) as ContentKey,
      isDeleted: false,
      status: PublishStatus.PUBLISHED,
    }).lean();
    if (!block) {
      return sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'Content not found', code: ErrorCodes.NOT_FOUND });
    }
    return new ApiResponse(ResponseCodes.OK, 'Content fetched successfully', { block: publicBlockView(block, req.lang) }).send(res);
  } catch (err) {
    return next(err);
  }
};

export { blockView, publicBlockView };
