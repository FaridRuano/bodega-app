import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        role: {
            type: String,
            enum: ["admin", "warehouse", "kitchen", "lounge"],
            default: null,
        },
        type: {
            type: String,
            required: true,
            trim: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        message: {
            type: String,
            default: "",
            trim: true,
        },
        href: {
            type: String,
            default: "",
            trim: true,
        },
        entityType: {
            type: String,
            default: "",
            trim: true,
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        priority: {
            type: String,
            enum: ["low", "normal", "high"],
            default: "normal",
        },
        dedupeKey: {
            type: String,
            default: "",
            trim: true,
        },
        seenAt: {
            type: Date,
            default: null,
        },
        readAt: {
            type: Date,
            default: null,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, readAt: 1, seenAt: 1, createdAt: -1 });

export default mongoose.models.Notification ||
    mongoose.model("Notification", NotificationSchema);
