import type { IMemberProfile } from '../models/MemberProfile';
import { MemberVisibility, type MemberVisibilityValue } from '../config/constants';

// Every response about a member is built from an explicit allowlist below. Nothing is ever
// spread from the database document, so adding a private field to the schema can never leak it.

/** What the public directory shows for an entry. */
export const toDirectoryEntry = (p: IMemberProfile) => ({
  id: p._id,
  name: p.displayName,
  village: p.village ?? null,
  city: p.city ?? null,
  country: p.country ?? null,
  occupation: p.occupation ?? null,
  bio: p.bio ?? null,
  joinedYear: p.joinedYear ?? null,
  highlighted: p.highlighted,
});

/** Only "public" is visible to visitors; anything else, including a legacy "members" value, counts as hidden. */
export const effectiveVisibility = (p: Pick<IMemberProfile, 'visibility'>): MemberVisibilityValue =>
  p.visibility === MemberVisibility.PUBLIC ? MemberVisibility.PUBLIC : MemberVisibility.HIDDEN;

interface StaffViewOptions {
  /** Holder of members.read.private: may also see phone, family size and kul. */
  includePrivate: boolean;
}

/** Staff list/detail view. Private fields only with the private permission. */
export const toStaffMember = (p: IMemberProfile, opts: StaffViewOptions) => ({
  ...toDirectoryEntry(p),
  membershipStatus: p.membershipStatus,
  visibility: effectiveVisibility(p),
  anonymizedAt: p.anonymizedAt ?? null,
  createdAt: p.createdAt,
  ...(opts.includePrivate
    ? { phone: p.phone ?? null, familySize: p.familySize ?? null, kul: p.kul ?? null }
    : {}),
});
