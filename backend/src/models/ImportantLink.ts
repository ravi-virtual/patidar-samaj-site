import mongoose, { Schema } from 'mongoose';
import { randomUUID as uuidv4 } from 'node:crypto';
import { LinkCategories } from '../config/constants';
import { publishableDefinition, type PublishableFields } from '../utils/schemaFields';

export interface IImportantLink extends PublishableFields {
  _id: string;
  label: string;
  description?: string;
  /** Gujarati twins of label and description. Optional: empty means show the English text. */
  labelGu?: string;
  descriptionGu?: string;
  /** An external http(s) address. Mutually exclusive with fileMediaId in practice (validated). */
  url?: string;
  /** An uploaded PDF served by this site. */
  fileMediaId?: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

const importantLinkSchema = new Schema<IImportantLink>(
  {
    _id: { type: String, default: () => uuidv4() },
    label: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 200 },
    labelGu: { type: String, trim: true, maxlength: 120 },
    descriptionGu: { type: String, trim: true, maxlength: 200 },
    url: { type: String, trim: true, maxlength: 500 },
    fileMediaId: { type: String },
    category: { type: String, enum: [...LinkCategories], default: 'Other' },
    ...publishableDefinition,
  },
  { timestamps: true, _id: false },
);

importantLinkSchema.index({ status: 1, category: 1, order: 1 });

export default mongoose.model<IImportantLink>('ImportantLink', importantLinkSchema);
