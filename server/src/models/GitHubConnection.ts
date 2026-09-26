import mongoose, { Document, Model, Schema } from "mongoose";

export interface IGitHubConnection extends Document {
  userId: mongoose.Types.ObjectId;

  githubUserId: number;
  githubUsername: string;
  githubName: string | null;
  githubAvatarUrl: string | null;

  accessToken: string;
  refreshToken: string | null;

  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;

  scope: string;

  createdAt: Date;
  updatedAt: Date;
}

const githubConnectionSchema =
  new Schema<IGitHubConnection>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
      },

      githubUserId: {
        type: Number,
        required: true,
      },

      githubUsername: {
        type: String,
        required: true,
        trim: true,
      },

      githubName: {
        type: String,
        default: null,
      },

      githubAvatarUrl: {
        type: String,
        default: null,
      },

 accessToken: {
  type: String,
  required: true,
  select: false,
},

refreshToken: {
  type: String,
  default: null,
  select: false,
},

      accessTokenExpiresAt: {
        type: Date,
        default: null,
      },

      refreshTokenExpiresAt: {
        type: Date,
        default: null,
      },

      scope: {
        type: String,
        default: "",
      },
    },
    {
      timestamps: true,
    }
  );

const GitHubConnection: Model<IGitHubConnection> =
  mongoose.model<IGitHubConnection>(
    "GitHubConnection",
    githubConnectionSchema
  );

export default GitHubConnection;