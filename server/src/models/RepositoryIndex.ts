import mongoose, { Document, Model, Schema } from "mongoose";

export type RepositoryIndexStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface IRepositoryIndex extends Document {
  userId: mongoose.Types.ObjectId;

  githubRepositoryId: number;
  repositoryName: string;
  repositoryFullName: string;
  owner: string;
  branch: string;

  totalEntries: number;
  sourceFileCount: number;
  skippedFileCount: number;
  treeTruncated: boolean;
  processedFileCount: number;
completedFileCount: number;
failedFileCount: number;

  status: RepositoryIndexStatus;

  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const repositoryIndexSchema = new Schema<IRepositoryIndex>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    githubRepositoryId: {
      type: Number,
      required: true,
    },

    repositoryName: {
      type: String,
      required: true,
      trim: true,
    },

    repositoryFullName: {
      type: String,
      required: true,
      trim: true,
    },

    owner: {
      type: String,
      required: true,
      trim: true,
    },

    branch: {
      type: String,
      required: true,
      trim: true,
    },

    totalEntries: {
      type: Number,
      default: 0,
      min: 0,
    },

    sourceFileCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    skippedFileCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    treeTruncated: {
      type: Boolean,
      default: false,
    },
    processedFileCount: {
  type: Number,
  default: 0,
  min: 0,
},

completedFileCount: {
  type: Number,
  default: 0,
  min: 0,
},

failedFileCount: {
  type: Number,
  default: 0,
  min: 0,
},
    

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
      ],
      default: "pending",
      index: true,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

repositoryIndexSchema.index(
  {
    userId: 1,
    githubRepositoryId: 1,
    branch: 1,
  },
  {
    unique: true,
  }
);

const RepositoryIndex: Model<IRepositoryIndex> =
  mongoose.model<IRepositoryIndex>(
    "RepositoryIndex",
    repositoryIndexSchema
  );

export default RepositoryIndex;