import mongoose, { Schema } from 'mongoose';
import { randomUUID as uuidv4 } from 'node:crypto';
import { PublicTabs } from '../config/publicTabs';

// Singleton document (key = "main"). Holds public organisation details and switches such as
// which public website tabs are shown. Never store secrets or infrastructure configuration here.
const organizationSettingsSchema = new Schema(
  {
    _id: { type: String, default: () => uuidv4() },
    key: { type: String, default: 'main', unique: true, immutable: true },

    name: { type: String, default: 'Uttar Gujarat Kadva Patidar Samaj', maxlength: 150, trim: true },
    shortName: { type: String, default: 'Kadva Patidar Samaj', maxlength: 80, trim: true },
    invocation: { type: String, default: 'Jay Umiya Maa', maxlength: 80, trim: true },
    tagline: { type: String, default: '', maxlength: 200, trim: true },
    // Gujarati twins of the organisation texts. Optional: empty means show the English text.
    nameGu: { type: String, default: '', maxlength: 150, trim: true },
    shortNameGu: { type: String, default: '', maxlength: 80, trim: true },
    invocationGu: { type: String, default: '', maxlength: 80, trim: true },
    taglineGu: { type: String, default: '', maxlength: 200, trim: true },
    logoMediaId: { type: String },

    contact: {
      email: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
      phone: { type: String, default: '', trim: true, maxlength: 30 },
      address: { type: String, default: '', trim: true, maxlength: 400 },
      officeHours: { type: String, default: '', trim: true, maxlength: 200 },
      addressGu: { type: String, default: '', trim: true, maxlength: 400 },
      officeHoursGu: { type: String, default: '', trim: true, maxlength: 200 },
    },
    socialLinks: {
      type: [{ label: { type: String, maxlength: 40 }, url: { type: String, maxlength: 500 } }],
      default: [],
    },
    footerNote: { type: String, default: '', maxlength: 400 },
    footerNoteGu: { type: String, default: '', maxlength: 400, trim: true },

    // One on/off switch per public tab. A missing key counts as on (see config/publicTabs.ts).
    publicTabs: Object.fromEntries(PublicTabs.map((tab) => [tab, { type: Boolean, default: true }])),
    themeDefault: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
  },
  { timestamps: true, _id: false },
);

export default mongoose.model('OrganizationSettings', organizationSettingsSchema);
