import { Schema, model, models } from "mongoose";
import { STOCK_LOCATIONS } from "./InventoryStock";
import { PRODUCT_UNITS } from "@libs/constants/units";
import { PRODUCTION_TEMPLATE_TYPES } from "@libs/constants/productionTypes";
import { PRODUCTION_STATUSES } from "@libs/constants/productionStatus";
import { PRODUCTION_WASTE_TYPES } from "@libs/constants/productionStatus";

export const PRODUCTION_WASTE_ORIGIN_KINDS = [
    "input",
    "output",
    "process",
];

const productionItemSchema = new Schema(
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

        productTypeSnapshot: {
            type: String,
            trim: true,
            default: "",
        },

        unitSnapshot: {
            type: String,
            required: true,
            enum: PRODUCT_UNITS,
            trim: true,
        },

        quantity: {
            type: Number,
            required: true,
            min: 0.000001,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 300,
            default: "",
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

        productTypeSnapshot: {
            type: String,
            trim: true,
            default: "",
        },

        unitSnapshot: {
            type: String,
            required: true,
            enum: PRODUCT_UNITS,
            trim: true,
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

        isMain: {
            type: Boolean,
            default: false,
        },

        isByProduct: {
            type: Boolean,
            default: false,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 300,
            default: "",
        },
    },
    { _id: true }
);

const productionWasteSchema = new Schema(
    {
        type: {
            type: String,
            enum: PRODUCTION_WASTE_TYPES,
            required: true,
        },

        quantity: {
            type: Number,
            required: true,
            min: 0.000001,
        },

        unitSnapshot: {
            type: String,
            required: true,
            enum: PRODUCT_UNITS,
            trim: true,
        },

        originKind: {
            type: String,
            enum: PRODUCTION_WASTE_ORIGIN_KINDS,
            default: "process",
        },

        originProductId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            default: null,
        },

        originCodeSnapshot: {
            type: String,
            trim: true,
            uppercase: true,
            default: "",
        },

        originNameSnapshot: {
            type: String,
            trim: true,
            maxlength: 120,
            default: "",
        },

        originUnitSnapshot: {
            type: String,
            enum: PRODUCT_UNITS,
            trim: true,
            default: null,
        },

        sourceLocation: {
            type: String,
            enum: STOCK_LOCATIONS,
            default: "kitchen",
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

        productionTemplateId: {
            type: Schema.Types.ObjectId,
            ref: "ProductionTemplate",
            required: true,
            index: true,
        },

        templateSnapshot: {
            code: {
                type: String,
                trim: true,
                uppercase: true,
                default: "",
            },
            name: {
                type: String,
                required: true,
                trim: true,
                maxlength: 120,
            },
            type: {
                type: String,
                required: true,
                trim: true,
            },
            baseUnit: {
                type: String,
                required: true,
                enum: PRODUCT_UNITS,
                trim: true,
            },
            expectedYield: {
                type: Number,
                min: 0,
                max: 100,
                default: null,
            },
            expectedWaste: {
                type: Number,
                min: 0,
                max: 100,
                default: null,
            },
            defaultDestination: {
                type: String,
                enum: ["kitchen", "warehouse", "none"],
                default: "kitchen",
            },
            allowsMultipleOutputs: {
                type: Boolean,
                default: false,
            },
            requiresWasteRecord: {
                type: Boolean,
                default: false,
            },
            allowRealOutputAdjustment: {
                type: Boolean,
                default: true,
            },
        },

        productionType: {
            type: String,
            enum: PRODUCTION_TEMPLATE_TYPES,
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

        targetQuantity: {
            type: Number,
            required: true,
            min: 0.000001,
        },

        targetUnit: {
            type: String,
            required: true,
            enum: PRODUCT_UNITS,
            trim: true,
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

        expectedInputs: {
            type: [productionItemSchema],
            default: [],
        },

        expectedOutputs: {
            type: [productionOutputSchema],
            default: [],
        },

        inputs: {
            type: [productionItemSchema],
            default: [],
        },

        outputs: {
            type: [productionOutputSchema],
            default: [],
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

        cancelledAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

productionSchema.pre("validate", function (next) {
    if (this.location !== "kitchen") {
        return next(
            new Error("La producción solo puede consumir inventario desde kitchen.")
        );
    }

    if (
        this.productionType &&
        this.templateSnapshot?.type &&
        this.productionType !== this.templateSnapshot.type &&
        this.productionType !== "generic"
    ) {
        return next(
            new Error("El tipo de producción no coincide con el tipo de la plantilla.")
        );
    }

    if (this.status === "in_progress" && !this.startedAt) {
        this.startedAt = new Date();
    }

    if (this.status === "completed") {
        if (!this.startedAt) {
            return next(
                new Error("Una producción completada debe tener fecha de inicio.")
            );
        }

        if (!this.completedAt) {
            return next(
                new Error("Una producción completada debe tener fecha de finalización.")
            );
        }

        if (!Array.isArray(this.inputs) || this.inputs.length === 0) {
            return next(
                new Error("Una producción completada debe tener insumos reales.")
            );
        }

        if (!Array.isArray(this.outputs) || this.outputs.length === 0) {
            return next(
                new Error("Una producción completada debe tener resultados reales.")
            );
        }

        if (
            this.templateSnapshot?.requiresWasteRecord &&
            (!Array.isArray(this.waste) || this.waste.length === 0)
        ) {
            return next(
                new Error("Esta producción requiere registrar merma o desperdicio.")
            );
        }
    }

    if (this.status === "cancelled" && !this.cancelledAt) {
        this.cancelledAt = new Date();
    }

});

productionSchema.index({ productionType: 1, status: 1 });
productionSchema.index({ performedBy: 1, createdAt: -1 });
productionSchema.index({ productionTemplateId: 1, createdAt: -1 });
productionSchema.index({ status: 1, createdAt: -1 });

const Production =
    models.Production || model("Production", productionSchema);

export default Production;