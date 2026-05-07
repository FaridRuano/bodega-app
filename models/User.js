import mongoose from "mongoose";
import { USER_ROLES, normalizeUserRole } from "@libs/userRoles";

const UserSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true,
            trim: true,
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
        },
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
            default: undefined,
            set: (value) => {
                const normalized = String(value || "").trim().toLowerCase();
                return normalized || undefined;
            },
        },

        password: {
            type: String,
            required: true,
            minlength: 6,
            select: false,
        },
        role: {
            type: String,
            enum: USER_ROLES,
            default: "kitchen",
            set: (value) => normalizeUserRole(value, value),
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastLoginAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

UserSchema.index(
    { email: 1 },
    {
        unique: true,
        partialFilterExpression: {
            email: { $type: "string", $ne: "" },
        },
    }
);

UserSchema.virtual("fullName").get(function () {
    return `${this.firstName} ${this.lastName}`;
});

const existingUserModel = mongoose.models.User;
const existingRoleEnum = existingUserModel?.schema?.path("role")?.enumValues || [];
const shouldRebuildUserModel =
    existingUserModel &&
    JSON.stringify(existingRoleEnum) !== JSON.stringify(USER_ROLES);

const User =
    shouldRebuildUserModel
        ? (delete mongoose.models.User, mongoose.model("User", UserSchema))
        : existingUserModel || mongoose.model("User", UserSchema);

export default User;
