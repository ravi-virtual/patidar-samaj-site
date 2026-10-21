import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { EventCategories, EventStatus, type EventStatusValue } from '../config/constants';

export interface IEvent {
  _id: string;
  title: string;
  category: string;
  description?: string;
  startsAt: Date;
  endsAt?: Date;
  venue: string;
  /** 0 means unlimited. */
  capacity: number;
  /** Total attendees across confirmed RSVPs. Changed only with atomic $inc, never read-modify-write. */
  registeredCount: number;
  registrationOpensAt?: Date;
  registrationClosesAt?: Date;
  status: EventStatusValue;
  featured: boolean;
  imageMediaId?: string;
  publishedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdBy?: string;
  updatedBy?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<IEvent>(
  {
    _id: { type: String, default: () => uuidv4() },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
    category: { type: String, enum: [...EventCategories], default: 'Other' },
    description: { type: String, trim: true, maxlength: 4000 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date },
    venue: { type: String, required: true, trim: true, maxlength: 200 },
    capacity: { type: Number, default: 0, min: 0, max: 100000 },
    registeredCount: { type: Number, default: 0, min: 0 },
    registrationOpensAt: { type: Date },
    registrationClosesAt: { type: Date },
    status: { type: String, enum: Object.values(EventStatus), default: EventStatus.DRAFT },
    featured: { type: Boolean, default: false },
    imageMediaId: { type: String },
    publishedAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, maxlength: 500 },
    createdBy: { type: String },
    updatedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false },
);

eventSchema.index({ status: 1, startsAt: 1 });
eventSchema.index({ startsAt: -1 });
eventSchema.index({ category: 1, startsAt: 1 });

export default mongoose.model<IEvent>('Event', eventSchema);
