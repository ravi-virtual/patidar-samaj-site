import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { publishableDefinition, type PublishableFields } from '../utils/schemaFields';

export interface ICommitteeTerm extends PublishableFields {
  _id: string;
  /** Display label such as "2025–2027". Never hard-coded in application logic. */
  label: string;
  startYear: number;
  endYear: number;
  /** The term shown by default on the public Committee page. */
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const committeeTermSchema = new Schema<ICommitteeTerm>(
  {
    _id: { type: String, default: () => uuidv4() },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    startYear: { type: Number, required: true, min: 1900, max: 2200 },
    endYear: { type: Number, required: true, min: 1900, max: 2200 },
    isCurrent: { type: Boolean, default: false },
    ...publishableDefinition,
  },
  { timestamps: true, _id: false },
);

committeeTermSchema.index({ status: 1, startYear: -1 });

export default mongoose.model<ICommitteeTerm>('CommitteeTerm', committeeTermSchema);
