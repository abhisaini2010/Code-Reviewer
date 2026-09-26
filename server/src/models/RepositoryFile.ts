import mongoose, { Document, Model, Schema } from "mongoose";

export type RepositoryFileStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface IRepositoryFileParsedData {
  totalLines: number;
  nonEmptyLines: number;
  commentLines: number;
  importCount: number;
  exportCount: number;
  functionCount: number;
  classCount: number;
  dependencyCount: number;
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  dependencies: string[];
}

export interface IRepositoryFile extends Document {
  repositoryIndexId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;

  githubRepositoryId: number;
  repositoryFullName: string;
  branch: string;

  path: string;
  sha: string;
  size: number;

  extension: string;
  language: string | null;

  content: string;

  parsedData: IRepositoryFileParsedData | null;
  parsedAt: Date | null;

  status: RepositoryFileStatus;
  errorMessage: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const repositoryFileParsedDataSchema =
  new Schema<IRepositoryFileParsedData>(
    {
      totalLines: {
        type: Number,
        required: true,
        min: 0,
      },

      nonEmptyLines: {
        type: Number,
        required: true,
        min: 0,
      },

      commentLines: {
        type: Number,
        required: true,
        min: 0,
      },

      importCount: {
        type: Number,
        required: true,
        min: 0,
      },

      exportCount: {
        type: Number,
        required: true,
        min: 0,
      },

      functionCount: {
        type: Number,
        required: true,
        min: 0,
      },

      classCount: {
        type: Number,
        required: true,
        min: 0,
      },

      dependencyCount: {
        type: Number,
        required: true,
        min: 0,
      },

      imports: {
        type: [String],
        default: [],
      },

      exports: {
        type: [String],
        default: [],
      },

      functions: {
        type: [String],
        default: [],
      },

      classes: {
        type: [String],
        default: [],
      },

      dependencies: {
        type: [String],
        default: [],
      },
    },
    {
      _id: false,
    }
  );

const repositoryFileSchema = new Schema<IRepositoryFile>(
  {
    repositoryIndexId: {
      type: Schema.Types.ObjectId,
      ref: "RepositoryIndex",
      required: true,
      index: true,
    },

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

    repositoryFullName: {
      type: String,
      required: true,
      trim: true,
    },

    branch: {
      type: String,
      required: true,
      trim: true,
    },

    path: {
      type: String,
      required: true,
      trim: true,
    },

    sha: {
      type: String,
      required: true,
      trim: true,
    },

    size: {
      type: Number,
      required: true,
      min: 0,
    },

    extension: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    language: {
      type: String,
      default: null,
    },

  content: {
  type: String,
  default: "",
},

    parsedData: {
      type: repositoryFileParsedDataSchema,
      default: null,
    },

    parsedAt: {
      type: Date,
      default: null,
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

    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

repositoryFileSchema.index(
  {
    repositoryIndexId: 1,
    path: 1,
  },
  {
    unique: true,
  }
);

const RepositoryFile: Model<IRepositoryFile> =
  mongoose.model<IRepositoryFile>(
    "RepositoryFile",
    repositoryFileSchema
  );

export default RepositoryFile;
