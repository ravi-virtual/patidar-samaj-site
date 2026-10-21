import OrganizationSettings from '../models/OrganizationSettings';

/**
 * Returns the single organisation settings document, creating it with defaults the first time.
 * An upsert keeps this safe when several requests arrive before it exists.
 */
export const getSettings = async () => {
  return OrganizationSettings.findOneAndUpdate(
    { key: 'main' },
    { $setOnInsert: { key: 'main' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
};
