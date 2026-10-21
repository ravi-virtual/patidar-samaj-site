import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { RegistrationStatus, type RegistrationStatusValue } from '../config/constants';

export interface IEventRegistration {
  _id: string;
  eventId: string;
  userId: string;
  attendees: number;
  status: RegistrationStatusValue;
  cancelledAt?: Date;
  cancelledBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// One document per (event, user). Cancelling flips the status; re-registering revives the same
// document, so the unique index below is what makes duplicate registration impossible even under
// concurrent requests. Lives in its own collection (not an array on Event) so it never grows
// without bound inside one document.
const registrationSchema = new Schema<IEventRegistration>(
  {
    _id: { type: String, default: () => uuidv4() },
    eventId: { type: String, required: true },
    userId: { type: String, required: true },
    attendees: { type: Number, required: true, min: 1, max: 10, default: 1 },
    status: { type: String, enum: Object.values(RegistrationStatus), default: RegistrationStatus.CONFIRMED },
    cancelledAt: { type: Date },
    cancelledBy: { type: String },
  },
  { timestamps: true, _id: false },
);

registrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });
registrationSchema.index({ userId: 1, status: 1, createdAt: -1 });
registrationSchema.index({ eventId: 1, status: 1, createdAt: 1 });

export default mongoose.model<IEventRegistration>('EventRegistration', registrationSchema);
