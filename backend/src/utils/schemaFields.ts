import { PublishStatus, type PublishStatusValue } from '../config/constants';

/** Fields shared by every managed content type (FAQ, link, milestone, committee, block). */
export interface PublishableFields {
  status: PublishStatusValue;
  order: number;
  publishedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
  isDeleted: boolean;
}

export const publishableDefinition = {
  status: { type: String, enum: Object.values(PublishStatus), default: PublishStatus.DRAFT },
  order: { type: Number, default: 0 },
  publishedAt: { type: Date },
  createdBy: { type: String },
  updatedBy: { type: String },
  isDeleted: { type: Boolean, default: false },
} as const;
