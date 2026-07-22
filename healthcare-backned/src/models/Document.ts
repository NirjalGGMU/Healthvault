import mongoose, { Document as MongooseDocument, Schema, Types } from 'mongoose';

export interface IVaultDocument extends MongooseDocument {
  ownerId: Types.ObjectId;
  originalName: string;
  storedName: string; // random UUID filename on disk — never the original name
  mimeType: string;
  size: number;
  createdAt: Date;
}

const documentSchema = new Schema<IVaultDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'ownerId is required'],
      index: true,
    },
    originalName: { type: String, required: [true, 'originalName is required'] },
    storedName: { type: String, required: [true, 'storedName is required'] },
    mimeType: { type: String, required: [true, 'mimeType is required'] },
    size: { type: Number, required: [true, 'size is required'] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IVaultDocument>('Document', documentSchema);
