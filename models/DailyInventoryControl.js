import { Schema, model, models } from "mongoose";
import { STOCK_LOCATIONS } from "./InventoryStock";

export const DAILY_CONTROL_LOCATIONS = ["kitchen", "lounge"];

const dailyInventoryControlLineSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        productCodeSnapshot: {
            type: String,
            trim: true,
            uppercase: true,
            default: "",
        },
        productNameSnapshot: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120,
        },
        unitSnapshot: {
            type: String,
            required: true,
            trim: true,
        },
        openingQuantity: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        systemQuantityBeforeAdjustment: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        issuedQuantity: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        closingQuantity: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        note: {
            type: String,
            trim: true,
            maxlength: 300,
            default: "",
        },
    },
    { _id: true }
);

const dailyInventoryControlEditLogSchema = new Schema(
    {
        editedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        previousNotes: {
            type: String,
            trim: true,
            maxlength: 600,
            default: "",
        },
        newNotes: {
            type: String,
            trim: true,
            maxlength: 600,
            default: "",
        },
        totalIssuedBefore: {
            type: Number,
            default: 0,
            min: 0,
        },
        totalIssuedAfter: {
            type: Number,
            default: 0,
            min: 0,
        },
        changesCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        editedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: true }
);

const dailyInventoryControlSchema = new Schema(
    {
        controlNumber: {
            type: String,
            trim: true,
            uppercase: true,
            default: "",
            index: true,
        },
        controlDate: {
            type: Date,
            required: true,
            index: true,
        },
        location: {
            type: String,
            required: true,
            enum: DAILY_CONTROL_LOCATIONS,
            index: true,
        },
        previousControlId: {
            type: Schema.Types.ObjectId,
            ref: "DailyInventoryControl",
            default: null,
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 600,
            default: "",
        },
        lines: {
            type: [dailyInventoryControlLineSchema],
            default: [],
        },
        summary: {
            productsCount: {
                type: Number,
                default: 0,
            },
            totalIssuedQuantity: {
                type: Number,
                default: 0,
            },
            totalClosingQuantity: {
                type: Number,
                default: 0,
            },
        },
        registeredBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        lastEditedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        editHistory: {
            type: [dailyInventoryControlEditLogSchema],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

dailyInventoryControlSchema.index(
    { controlDate: 1, location: 1 },
    { unique: true }
);

dailyInventoryControlSchema.pre("validate", function () {
    if (!Array.isArray(this.lines) || this.lines.length === 0) {
        throw new Error("El control diario debe registrar al menos un producto.");
    }

    const hasMovement = this.lines.some(
        (line) => Number(line.issuedQuantity || 0) > 0
    );

    if (!hasMovement) {
        throw new Error("Debes registrar al menos una salida en el control diario.");
    }
});

const existingDailyInventoryControlModel = models.DailyInventoryControl;

const shouldRebuildDailyInventoryControlModel =
    existingDailyInventoryControlModel &&
    (!existingDailyInventoryControlModel.schema.path("lastEditedBy") ||
        !existingDailyInventoryControlModel.schema.path("editHistory"));

if (shouldRebuildDailyInventoryControlModel) {
    delete models.DailyInventoryControl;
}

const DailyInventoryControl =
    models.DailyInventoryControl ||
    model("DailyInventoryControl", dailyInventoryControlSchema);

export default DailyInventoryControl;
