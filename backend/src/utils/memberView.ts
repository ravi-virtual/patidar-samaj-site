import type { IMemberProfile } from '../models/MemberProfile';

// Every response about a member is built from an explicit allowlist below. Nothing is ever
// spread from the database document, so adding a private field to the schema can never leak it.

/** What anyone allowed to see the entry gets (public site and signed-in directory). */
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

/** The owner's own view of their profile. Includes private details the directory never shows. */
export const toOwnerProfile = (p: IMemberProfile, accountPhone?: string | null) => ({
  ...toDirectoryEntry(p),
  familySize: p.familySize ?? null,
  kul: p.kul ?? null,
  phone: accountPhone ?? p.phone ?? null,
  visibility: p.visibility,
  membershipStatus: p.membershipStatus,
});

interface StaffViewOptions {
  /** Holder of members.read.private: may also see phone, family size and kul. */
  includePrivate: boolean;
  accountPhone?: string | null;
  accountStatus?: string | null;
}

/** Staff list/detail view. Private fields only with the private permission. */
export const toStaffMember = (p: IMemberProfile, opts: StaffViewOptions) => ({
  ...toDirectoryEntry(p),
  userId: p.userId ?? null,
  hasAccount: Boolean(p.userId),
  accountStatus: opts.accountStatus ?? null,
  membershipStatus: p.membershipStatus,
  visibility: p.visibility,
  anonymizedAt: p.anonymizedAt ?? null,
  createdAt: p.createdAt,
  ...(opts.includePrivate
    ? { phone: opts.accountPhone ?? p.phone ?? null, familySize: p.familySize ?? null, kul: p.kul ?? null }
    : {}),
});
