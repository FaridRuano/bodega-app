import mongoose from "mongoose";

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
            enum: ["admin", "kitchen", "warehouse"],
            default: "kitchen",
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

export default mongoose.models.User || mongoose.model("User", UserSchema);
