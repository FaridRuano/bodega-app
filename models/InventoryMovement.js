import { Schema, model, models } from "mongoose";
import { STOCK_LOCATIONS } from "./InventoryStock";

export const MOVEMENT_TYPES = [
    "purchase_entry",
    "request_dispatch",
    "request_return",
    "production_consumption",
    "production_output",
    "transfer",
    "adjustment_in",
    "adjustment_out",
    "waste",
];

export const MOVEMENT_REFERENCE_TYPES = [
    "purchase_entry",
    "request",
    "production",
    "daily_control",
    "manual_adjustment",
    "system",
];

const inventoryMovementSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: [true, "Product is required."],
            index: true,
        },

        movementType: {
            type: String,
            enum: MOVEMENT_TYPES,
            required: [true, "Movement type is required."],
            index: true,
        },

        quantity: {
            type: Number,
            required: [true, "Quantity is required."],
            min: [0.000001, "Quantity must be greater than zero."],
        },

        unitSnapshot: {
            type: String,
            required: [true, "Unit snapshot is required."],
            trim: true,
        },

        fromLocation: {
            type: String,
            enum: STOCK_LOCATIONS,
            default: undefined,
            index: true,
        },

        toLocation: {
            type: String,
            enum: STOCK_LOCATIONS,
            default: undefined,
            index: true,
        },

        referenceType: {
            type: String,
            enum: MOVEMENT_REFERENCE_TYPES,
            default: "system",
            index: true,
        },

        referenceId: {
            type: Schema.Types.ObjectId,
            default: null,
            index: true,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: [500, "Notes cannot exceed 500 characters."],
            default: "",
        },

        performedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Performed by user is required."],
            index: true,
        },

        movementDate: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

inventoryMovementSchema.index({ productId: 1, movementDate: -1 });
inventoryMovementSchema.index({ movementType: 1, movementDate: -1 });
inventoryMovementSchema.index({ referenceType: 1, referenceId: 1 });
inventoryMovementSchema.index({ fromLocation: 1, toLocation: 1 });

const InventoryMovement =
    models.InventoryMovement ||
    model("InventoryMovement", inventoryMovementSchema);

export default InventoryMovement;
