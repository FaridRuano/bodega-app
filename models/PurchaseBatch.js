import { Schema, model, models } from "mongoose";
import {
    PURCHASE_BATCH_ACTIVITY_TYPES,
    PURCHASE_BATCH_STATUSES,
} from "@libs/purchaseRequests";
import { STOCK_LOCATIONS } from "./InventoryStock";

const purchaseAllocationSchema = new Schema(
    {
        purchaseRequestId: {
            type: Schema.Types.ObjectId,
            ref: "PurchaseRequest",
            required: true,
        },
        purchaseRequestItemId: {
            type: Schema.Types.ObjectId,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: [0.000001, "Allocation quantity must be greater than zero."],
        },
    },
    {
        _id: false,
        timestamps: false,
    }
);

const purchaseBatchItemSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        unitSnapshot: {
            type: String,
            required: true,
            trim: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: [0.000001, "Purchased quantity must be greater than zero."],
        },
        unitCost: {
            type: Number,
            default: null,
            min: [0, "Unit cost cannot be negative."],
        },
        totalCost: {
            type: Number,
            default: null,
            min: [0, "Total cost cannot be negative."],
        },
        note: {
            type: String,
            trim: true,
            maxlength: [250, "Item note cannot exceed 250 characters."],
            default: "",
        },
        allocations: {
            type: [purchaseAllocationSchema],
            default: [],
        },
    },
    {
        _id: true,
        timestamps: false,
    }
);

const purchaseBatchActivitySchema = new Schema(
    {
        type: {
            type: String,
            enum: PURCHASE_BATCH_ACTIVITY_TYPES,
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

const purchaseBatchSchema = new Schema(
    {
        batchNumber: {
            type: String,
            trim: true,
            uppercase: true,
            unique: true,
            sparse: true,
            index: true,
        },
        status: {
            type: String,
            enum: PURCHASE_BATCH_STATUSES,
            default: "purchased",
            index: true,
        },
        purchasedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        dispatchedAt: {
            type: Date,
            default: null,
            index: true,
        },
        supplierName: {
            type: String,
            trim: true,
            maxlength: [140, "Supplier name cannot exceed 140 characters."],
            default: "",
        },
        note: {
            type: String,
            trim: true,
            maxlength: [500, "Batch note cannot exceed 500 characters."],
            default: "",
        },
        destinationLocation: {
            type: String,
            enum: STOCK_LOCATIONS,
            default: "warehouse",
            index: true,
        },
        registeredBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        dispatchedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },
        items: {
            type: [purchaseBatchItemSchema],
            validate: {
                validator(items) {
                    return Array.isArray(items) && items.length > 0;
                },
                message: "At least one purchased item is required.",
            },
        },
        activityLog: {
            type: [purchaseBatchActivitySchema],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

purchaseBatchSchema.index({ purchasedAt: -1, status: 1 });

purchaseBatchSchema.methods.addActivity = function ({
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

const PurchaseBatch =
    models.PurchaseBatch || model("PurchaseBatch", purchaseBatchSchema);

export default PurchaseBatch;
