import MemberProfile from '../models/MemberProfile';
import { MembershipStatus, MemberVisibility, type MembershipStatusValue } from '../config/constants';

/**
 * Keeps the directory entry in step with the account: approving makes it active, rejecting or
 * suspending hides it from the directory, reactivating restores it. Creates the profile if an
 * older account has none.
 */
export const syncProfileForAccount = async (
  user: { _id: string; name: string; phone?: string | null },
  membershipStatus: MembershipStatusValue,
  createIfMissing = true,
): Promise<void> => {
  const updated = await MemberProfile.updateOne(
    { userId: user._id, isDeleted: false },
    { $set: { membershipStatus, displayName: user.name } },
  );
  if (updated.matchedCount === 0 && createIfMissing) {
    await MemberProfile.create({
      userId: user._id,
      displayName: user.name,
      membershipStatus,
      visibility: MemberVisibility.MEMBERS,
      joinedYear: membershipStatus === MembershipStatus.ACTIVE ? new Date().getFullYear() : undefined,
    });
  }
};
