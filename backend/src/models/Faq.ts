import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { publishableDefinition, type PublishableFields } from '../utils/schemaFields';

export interface IFaq extends PublishableFields {
  _id: string;
  question: string;
  answer: string;
  createdAt: Date;
  updatedAt: Date;
}

const faqSchema = new Schema<IFaq>(
  {
    _id: { type: String, default: () => uuidv4() },
    question: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
    ...publishableDefinition,
  },
  { timestamps: true, _id: false },
);

faqSchema.index({ status: 1, order: 1 });

export default mongoose.model<IFaq>('Faq', faqSchema);
