import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { publishableDefinition, type PublishableFields } from '../utils/schemaFields';

/** The editable text blocks the site knows about. Anything else is rejected by validation. */
export const ContentKeys = [
  'home.welcome',
  'home.stats',
  'about.intro',
  'about.mission',
  'about.vision',
  'about.volunteers',
  'about.values',
  'about.achievements',
  'about.activities',
  'history.intro',
] as const;
export type ContentKey = (typeof ContentKeys)[number];

export interface IContentItem {
  title?: string;
  text?: string;
  value?: string;
  label?: string;
  imageMediaId?: string;
}

export interface IContentBlock extends PublishableFields {
  _id: string;
  key: ContentKey;
  title?: string;
  body?: string;
  items: IContentItem[];
  createdAt: Date;
  updatedAt: Date;
}

// Structured fields instead of free HTML: a heading, plain-text body and a short list of
// title/text or value/label items. The front end decides how to render them.
const contentBlockSchema = new Schema<IContentBlock>(
  {
    _id: { type: String, default: () => uuidv4() },
    key: { type: String, enum: [...ContentKeys], required: true, unique: true },
    title: { type: String, trim: true, maxlength: 150 },
    body: { type: String, trim: true, maxlength: 6000 },
    items: {
      type: [
        new Schema(
          {
            title: { type: String, trim: true, maxlength: 120 },
            text: { type: String, trim: true, maxlength: 600 },
            value: { type: String, trim: true, maxlength: 40 },
            label: { type: String, trim: true, maxlength: 120 },
            imageMediaId: { type: String },
          },
          { _id: false },
        ),
      ],
      default: [],
      validate: [(v: unknown[]) => v.length <= 20, 'A block can hold at most 20 items'],
    },
    ...publishableDefinition,
  },
  { timestamps: true, _id: false },
);

export default mongoose.model<IContentBlock>('ContentBlock', contentBlockSchema);
