import mongoose, { Schema } from 'mongoose';
import { randomUUID as uuidv4 } from 'node:crypto';
import { ContactStatus, ContactTopics, type ContactStatusValue } from '../config/constants';

export interface IContactNote {
  authorId: string;
  text: string;
  createdAt: Date;
}

export interface IContactMessage {
  _id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: ContactStatusValue;
  assignedTo?: string | null;
  notes: IContactNote[];
  resolvedAt?: Date;
  /** Hash of the sender's IP, used only to throttle repeat submissions. The raw IP is not kept. */
  ipHash?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Personal data submitted by visitors: only staff holding contacts.read can ever read it.
const contactMessageSchema = new Schema<IContactMessage>(
  {
    _id: { type: String, default: () => uuidv4() },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    topic: { type: String, enum: [...ContactTopics], default: 'General enquiry' },
    message: { type: String, required: true, trim: true, minlength: 10, maxlength: 4000 },
    status: { type: String, enum: Object.values(ContactStatus), default: ContactStatus.NEW },
    assignedTo: { type: String, default: null },
    notes: {
      type: [
        new Schema(
          {
            authorId: { type: String, required: true },
            text: { type: String, required: true, maxlength: 1000 },
            createdAt: { type: Date, default: () => new Date() },
          },
          { _id: false },
        ),
      ],
      default: [],
      validate: [(v: unknown[]) => v.length <= 100, 'Too many notes'],
    },
    resolvedAt: { type: Date },
    ipHash: { type: String, maxlength: 64 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false },
);

contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ assignedTo: 1, status: 1 });
contactMessageSchema.index({ email: 1, createdAt: -1 });
contactMessageSchema.index({ ipHash: 1, createdAt: -1 });

export default mongoose.model<IContactMessage>('ContactMessage', contactMessageSchema);
