import { Schema, model, models } from "mongoose";
import {
    PURCHASE_REQUEST_ACTIVITY_TYPES,
    PURCHASE_REQUEST_STATUSES,
    calculateRequestTotals,
    resolvePurchaseRequestStatus,
} from "@libs/purchaseRequests";
import { STOCK_LOCATIONS } from "./InventoryStock";

const purchaseRequestItemSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: [true, "Product is required."],
        },
        unitSnapshot: {
            type: String,
            required: [true, "Unit snapshot is required."],
            trim: true,
        },
        requestedQuantity: {
            type: Number,
            required: [true, "Requested quantity is required."],
            min: [0.000001, "Requested quantity must be greater than zero."],
        },
        approvedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Approved quantity cannot be negative."],
        },
        purchasedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Purchased quantity cannot be negative."],
        },
        dispatchedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Dispatched quantity cannot be negative."],
        },
        receivedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Received quantity cannot be negative."],
        },
        requesterNote: {
            type: String,
            trim: true,
            maxlength: [250, "Requester note cannot exceed 250 characters."],
            default: "",
        },
        adminNote: {
            type: String,
            trim: true,
            maxlength: [250, "Admin note cannot exceed 250 characters."],
            default: "",
        },
    },
    {
        _id: true,
        timestamps: false,
    }
);

const purchaseRequestActivitySchema = new Schema(
    {
        type: {
            type: String,
            enum: PURCHASE_REQUEST_ACTIVITY_TYPES,
            required: true,
        },
        performedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        performedAt: {
            type: Date,
            default: Date.now,
        },
        title: {
            type: String,
            trim: true,
            maxlength: [120, "Title cannot exceed 120 characters."],
            default: "",
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, "Description cannot exceed 500 characters."],
            default: "",
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: null,
        },
    },
    {
        _id: true,
        timestamps: false,
    }
);

const purchaseRequestSchema = new Schema(
    {
        requestNumber: {
            type: String,
            trim: true,
            uppercase: true,
            unique: true,
            sparse: true,
            index: true,
        },
        status: {
            type: String,
            enum: PURCHASE_REQUEST_STATUSES,
            default: "pending",
            index: true,
        },
        requestedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        approvedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },
        rejectedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        cancelledBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        destinationLocation: {
            type: String,
            enum: STOCK_LOCATIONS,
            required: true,
            default: "warehouse",
            index: true,
        },
        items: {
            type: [purchaseRequestItemSchema],
            validate: {
                validator(items) {
                    return Array.isArray(items) && items.length > 0;
                },
                message: "At least one request item is required.",
            },
        },
        requesterNote: {
            type: String,
            trim: true,
            maxlength: [500, "Requester note cannot exceed 500 characters."],
            default: "",
        },
        adminNote: {
            type: String,
            trim: true,
            maxlength: [500, "Admin note cannot exceed 500 characters."],
            default: "",
        },
        statusReason: {
            type: String,
            trim: true,
            maxlength: [300, "Status reason cannot exceed 300 characters."],
            default: "",
        },
        requestedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        approvedAt: {
            type: Date,
            default: null,
        },
        rejectedAt: {
            type: Date,
            default: null,
        },
        cancelledAt: {
            type: Date,
            default: null,
        },
        completedAt: {
            type: Date,
            default: null,
        },
        activityLog: {
            type: [purchaseRequestActivitySchema],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

purchaseRequestSchema.index({ status: 1, requestedAt: -1 });
purchaseRequestSchema.index({ requestedBy: 1, requestedAt: -1 });

purchaseRequestSchema.virtual("totals").get(function () {
    return calculateRequestTotals(this.items || []);
});

purchaseRequestSchema.methods.recalculateStatus = function () {
    this.status = resolvePurchaseRequestStatus(this);

    if (this.status === "completed" && !this.completedAt) {
        this.completedAt = new Date();
    }

    if (this.status !== "completed") {
        this.completedAt = null;
    }

    return this.status;
};

purchaseRequestSchema.methods.addActivity = function ({
    type,
    performedBy,
    title = "",
    description = "",
    metadata = null,
    performedAt = new Date(),
}) {
    this.activityLog.push({
        type,
        performedBy,
        title,
        description,
        metadata,
        performedAt,
    });
};

purchaseRequestSchema.set("toJSON", { virtuals: true });
purchaseRequestSchema.set("toObject", { virtuals: true });

const PurchaseRequest =
    models.PurchaseRequest || model("PurchaseRequest", purchaseRequestSchema);

export default PurchaseRequest;
