import { Schema, model, models } from "mongoose";
import { STOCK_LOCATIONS } from "./InventoryStock";

export const PRODUCTION_TYPES = [
    "filleting",
    "portioning",
    "seasoning",
    "preparation",
    "generic",
];

export const PRODUCTION_STATUSES = [
    "draft",
    "in_progress",
    "completed",
    "cancelled",
];

const productionInputSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        unitSnapshot: {
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 0.000001,
        },
    },
    { _id: true }
);

const productionOutputSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        unitSnapshot: {
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 0.000001,
        },
        destinationLocation: {
            type: String,
            enum: STOCK_LOCATIONS,
            default: "warehouse",
        },
    },
    { _id: true }
);

const productionWasteSchema = new Schema(
    {
        type: {
            type: String,
            enum: ["merma", "desperdicio"],
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 0,
        },
        unitSnapshot: {
            type: String,
            required: true,
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 250,
            default: "",
        },
    },
    { _id: true }
);

const productionSchema = new Schema(
    {
        productionNumber: {
            type: String,
            trim: true,
            uppercase: true,
            unique: true,
            sparse: true,
            index: true,
        },

        productionType: {
            type: String,
            enum: PRODUCTION_TYPES,
            default: "generic",
            index: true,
        },

        status: {
            type: String,
            enum: PRODUCTION_STATUSES,
            default: "draft",
            index: true,
        },

        location: {
            type: String,
            enum: STOCK_LOCATIONS,
            default: "kitchen",
        },

        performedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        relatedRequestId: {
            type: Schema.Types.ObjectId,
            ref: "Request",
            default: null,
            index: true,
        },

        inputs: {
            type: [productionInputSchema],
            validate: {
                validator: (arr) => arr.length > 0,
                message: "At least one input is required.",
            },
        },

        outputs: {
            type: [productionOutputSchema],
            validate: {
                validator: (arr) => arr.length > 0,
                message: "At least one output is required.",
            },
        },

        byproducts: {
            type: [productionOutputSchema],
            default: [],
        },

        waste: {
            type: [productionWasteSchema],
            default: [],
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
        },

        startedAt: {
            type: Date,
            default: null,
        },

        completedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

productionSchema.index({ productionType: 1, status: 1 });
productionSchema.index({ performedBy: 1, createdAt: -1 });

const Production =
    models.Production || model("Production", productionSchema);

export default Production;