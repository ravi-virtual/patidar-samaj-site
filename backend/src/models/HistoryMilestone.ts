import mongoose, { Schema } from 'mongoose';
import { randomUUID as uuidv4 } from 'node:crypto';
import { publishableDefinition, type PublishableFields } from '../utils/schemaFields';

export interface IHistoryMilestone extends PublishableFields {
  _id: string;
  /** A year, a date or an era label such as "Legend" or "Roots". Free text on purpose. */
  periodLabel: string;
  title: string;
  text: string;
  imageMediaId?: string;
  /** Where this is recorded (community or temple archive reference). Shown as the source. */
  sourceRef?: string;
  /** Gujarati twins of periodLabel, title, text and sourceRef. Optional: empty means show the English text. */
  periodLabelGu?: string;
  titleGu?: string;
  textGu?: string;
  sourceRefGu?: string;
  createdAt: Date;
  updatedAt: Date;
}

const historyMilestoneSchema = new Schema<IHistoryMilestone>(
  {
    _id: { type: String, default: () => uuidv4() },
    periodLabel: { type: String, required: true, trim: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
    text: { type: String, required: true, trim: true, maxlength: 1500 },
    imageMediaId: { type: String },
    sourceRef: { type: String, trim: true, maxlength: 200 },
    periodLabelGu: { type: String, trim: true, maxlength: 40 },
    titleGu: { type: String, trim: true, maxlength: 150 },
    textGu: { type: String, trim: true, maxlength: 1500 },
    sourceRefGu: { type: String, trim: true, maxlength: 200 },
    ...publishableDefinition,
  },
  { timestamps: true, _id: false },
);

historyMilestoneSchema.index({ status: 1, order: 1 });

export default mongoose.model<IHistoryMilestone>('HistoryMilestone', historyMilestoneSchema);
