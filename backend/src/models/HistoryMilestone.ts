import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
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
    ...publishableDefinition,
  },
  { timestamps: true, _id: false },
);

historyMilestoneSchema.index({ status: 1, order: 1 });

export default mongoose.model<IHistoryMilestone>('HistoryMilestone', historyMilestoneSchema);
