import mongoose, { Schema } from 'mongoose';
import { randomUUID as uuidv4 } from 'node:crypto';
import { EventCategories, EventStatus, type EventStatusValue } from '../config/constants';

export interface IEvent {
  _id: string;
  title: string;
  category: string;
  description?: string;
  startsAt: Date;
  endsAt?: Date;
  venue: string;
  status: EventStatusValue;
  featured: boolean;
  imageMediaId?: string;
  publishedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  /** Gujarati twins of title, description, venue and cancellationReason. Optional: empty means show the English text. */
  titleGu?: string;
  descriptionGu?: string;
  venueGu?: string;
  cancellationReasonGu?: string;
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
    status: { type: String, enum: Object.values(EventStatus), default: EventStatus.DRAFT },
    featured: { type: Boolean, default: false },
    imageMediaId: { type: String },
    publishedAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, maxlength: 500 },
    titleGu: { type: String, trim: true, maxlength: 150 },
    descriptionGu: { type: String, trim: true, maxlength: 4000 },
    venueGu: { type: String, trim: true, maxlength: 200 },
    cancellationReasonGu: { type: String, trim: true, maxlength: 500 },
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
