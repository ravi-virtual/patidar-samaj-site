import MediaAsset from '../models/MediaAsset';

/**
 * Returns the ids that do not point at an existing, undeleted asset of the expected kind, so a
 * record can never reference a missing file or (for example) use a PDF as a profile picture.
 */
export const missingMediaIds = async (
  ids: (string | null | undefined)[],
  kind?: 'image' | 'document',
): Promise<string[]> => {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!wanted.length) return [];
  const filter: Record<string, unknown> = { _id: { $in: wanted }, isDeleted: false };
  if (kind) filter.kind = kind;
  const found = await MediaAsset.find(filter).select('_id').lean();
  const have = new Set(found.map((m) => m._id));
  return wanted.filter((id) => !have.has(id));
};
