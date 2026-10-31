import mongoose, { Schema } from 'mongoose';
import { randomUUID as uuidv4 } from 'node:crypto';
import { publishableDefinition, type PublishableFields } from '../utils/schemaFields';

export interface ICommitteeMember extends PublishableFields {
  _id: string;
  termId: string;
  name: string;
  position: string;
  bio?: string;
  /** Gujarati twins of name, position and bio. Optional: empty means show the English text. */
  nameGu?: string;
  positionGu?: string;
  bioGu?: string;
  imageMediaId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const committeeMemberSchema = new Schema<ICommitteeMember>(
  {
    _id: { type: String, default: () => uuidv4() },
    termId: { type: String, required: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    position: { type: String, required: true, trim: true, maxlength: 80 },
    bio: { type: String, trim: true, maxlength: 800 },
    nameGu: { type: String, trim: true, maxlength: 100 },
    positionGu: { type: String, trim: true, maxlength: 80 },
    bioGu: { type: String, trim: true, maxlength: 800 },
    imageMediaId: { type: String },
    ...publishableDefinition,
  },
  { timestamps: true, _id: false },
);

committeeMemberSchema.index({ termId: 1, status: 1, order: 1 });

export default mongoose.model<ICommitteeMember>('CommitteeMember', committeeMemberSchema);
