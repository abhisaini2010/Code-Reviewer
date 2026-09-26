import mongoose, { Document, Model, Schema } from "mongoose";

export type RepositoryEmbeddingStatus =
  | "pending"
  | "completed"
  | "failed";

export interface IRepositoryEmbedding extends Document {
  repositoryIndexId: mongoose.Types.ObjectId;
  repositoryFileId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;

  path: string;
  chunkIndex: number;
  content: string;

  startLine: number;
  endLine: number;

  embedding: number[];
  embeddingModel: string;
  dimensions: number;

  sourceSha: string;

  status: RepositoryEmbeddingStatus;
  errorMessage: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const repositoryEmbeddingSchema =
  new Schema<IRepositoryEmbedding>(
    {
      repositoryIndexId: {
        type: Schema.Types.ObjectId,
        ref: "RepositoryIndex",
        required: true,
        index: true,
      },

      repositoryFileId: {
        type: Schema.Types.ObjectId,
        ref: "RepositoryFile",
        required: true,
        index: true,
      },

      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      path: {
        type: String,
        required: true,
        trim: true,
      },

      chunkIndex: {
        type: Number,
        required: true,
        min: 0,
      },

      content: {
        type: String,
        required: true,
      },

      startLine: {
        type: Number,
        required: true,
        min: 1,
      },

      endLine: {
        type: Number,
        required: true,
        min: 1,
      },

      embedding: {
        type: [Number],
        required: true,
        default: [],
      },

      embeddingModel: {
        type: String,
        required: true,
        trim: true,
      },

      dimensions: {
        type: Number,
        required: true,
        min: 1,
      },

      sourceSha: {
        type: String,
        required: true,
        trim: true,
      },

      status: {
        type: String,
        enum: ["pending", "completed", "failed"],
        default: "pending",
        index: true,
      },

      errorMessage: {
        type: String,
        default: null,
      },
    },
    { timestamps: true }
  );

repositoryEmbeddingSchema.index(
  {
    repositoryIndexId: 1,
    repositoryFileId: 1,
    chunkIndex: 1,
  },
  { unique: true }
);

repositoryEmbeddingSchema.index({
  userId: 1,
  repositoryIndexId: 1,
  status: 1,
});

const RepositoryEmbedding: Model<IRepositoryEmbedding> =
  mongoose.model<IRepositoryEmbedding>(
    "RepositoryEmbedding",
    repositoryEmbeddingSchema
  );

export default RepositoryEmbedding;
