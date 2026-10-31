import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AnnouncementCategories, PublishStatus, type PublishStatusValue } from '../config/constants';

export interface IAnnouncement {
  _id: string;
  title: string;
  summary?: string;
  body: string;
  /** Gujarati twins of title, summary and body. Optional: empty means show the English text. */
  titleGu?: string;
  summaryGu?: string;
  bodyGu?: string;
  category: string;
  status: PublishStatusValue;
  pinned: boolean;
  /** Lower numbers come first among pinned announcements. */
  order: number;
  featured: boolean;
  /** Scheduling: a published announcement is visible only once this moment has passed. */
  publishAt?: Date;
  publishedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    _id: { type: String, default: () => uuidv4() },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
    summary: { type: String, trim: true, maxlength: 300 },
    body: { type: String, required: true, trim: true, maxlength: 8000 },
    titleGu: { type: String, trim: true, maxlength: 150 },
    summaryGu: { type: String, trim: true, maxlength: 300 },
    bodyGu: { type: String, trim: true, maxlength: 8000 },
    category: { type: String, enum: [...AnnouncementCategories], default: 'Notice' },
    status: { type: String, enum: Object.values(PublishStatus), default: PublishStatus.DRAFT },
    pinned: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    publishAt: { type: Date },
    publishedAt: { type: Date },
    createdBy: { type: String },
    updatedBy: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false },
);

announcementSchema.index({ status: 1, pinned: -1, order: 1, publishAt: -1 });
announcementSchema.index({ category: 1, status: 1, publishAt: -1 });

export default mongoose.model<IAnnouncement>('Announcement', announcementSchema);
