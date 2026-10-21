import CommitteeMember from '../models/CommitteeMember';
import ContentBlock from '../models/ContentBlock';
import Event from '../models/Event';
import HistoryMilestone from '../models/HistoryMilestone';
import ImportantLink from '../models/ImportantLink';
import OrganizationSettings from '../models/OrganizationSettings';

/**
 * Where an asset is still in use. A file is only removable when this is empty, so deleting one
 * record can never break another that shares the same image, and a record being deleted never
 * takes a shared file with it.
 */
export const findMediaReferences = async (id: string): Promise<string[]> => {
  const checks: [string, Promise<unknown>][] = [
    ['event', Event.exists({ imageMediaId: id, isDeleted: false })],
    ['committee member', CommitteeMember.exists({ imageMediaId: id, isDeleted: false })],
    ['history milestone', HistoryMilestone.exists({ imageMediaId: id, isDeleted: false })],
    ['important link', ImportantLink.exists({ fileMediaId: id, isDeleted: false })],
    ['content block', ContentBlock.exists({ 'items.imageMediaId': id, isDeleted: false })],
    ['organisation logo', OrganizationSettings.exists({ logoMediaId: id })],
  ];
  const results = await Promise.all(checks.map(([, p]) => p));
  return checks.filter((_, i) => results[i]).map(([label]) => label);
};
