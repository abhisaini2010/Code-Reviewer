import mongoose, { Document, Model, Schema } from "mongoose";

export type RepositoryFileRole =
  | "component"
  | "service"
  | "api"
  | "controller"
  | "model"
  | "other";

export interface IRepositoryRelationship extends Document {
  repositoryIndexId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;

  sourceFileId: mongoose.Types.ObjectId;
  targetFileId: mongoose.Types.ObjectId;

  sourcePath: string;
  targetPath: string;

  dependency: string;

  sourceRole: RepositoryFileRole;
  targetRole: RepositoryFileRole;

  relationshipType: string;

  createdAt: Date;
  updatedAt: Date;
}

const repositoryRelationshipSchema =
  new Schema<IRepositoryRelationship>(
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

      sourceFileId: {
        type: Schema.Types.ObjectId,
        ref: "RepositoryFile",
        required: true,
        index: true,
      },

      targetFileId: {
        type: Schema.Types.ObjectId,
        ref: "RepositoryFile",
        required: true,
        index: true,
      },

      sourcePath: {
        type: String,
        required: true,
        trim: true,
      },

      targetPath: {
        type: String,
        required: true,
        trim: true,
      },

      dependency: {
        type: String,
        required: true,
        trim: true,
      },

      sourceRole: {
        type: String,
        enum: ["component", "service", "api", "controller", "model", "other"],
        required: true,
        default: "other",
      },

      targetRole: {
        type: String,
        enum: ["component", "service", "api", "controller", "model", "other"],
        required: true,
        default: "other",
      },

      relationshipType: {
        type: String,
        required: true,
        trim: true,
        default: "import",
      },
    },
    { timestamps: true }
  );

repositoryRelationshipSchema.index(
  {
    repositoryIndexId: 1,
    sourceFileId: 1,
    targetFileId: 1,
    dependency: 1,
  },
  { unique: true }
);

const RepositoryRelationship: Model<IRepositoryRelationship> =
  mongoose.model<IRepositoryRelationship>(
    "RepositoryRelationship",
    repositoryRelationshipSchema
  );

export default RepositoryRelationship;
