import mongoose from "mongoose";
import { UNIT_VALUES } from "@libs/constants/units";

const { Schema, model, models } = mongoose;

export const PRODUCTION_TEMPLATE_TYPES = [
    "transformation",
    "cutting",
    "preparation",
    "portioning",
];

export const DESTINATION_TYPES = [
    "kitchen",
    "warehouse",
    "none",
];

const productionTemplateInputSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },

        quantity: {
            type: Number,
            required: true,
            min: 0.0001,
        },

        unit: {
            type: String,
            required: true,
            trim: true,
            enum: UNIT_VALUES,
        },

        isPrimary: {
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

const productionTemplateOutputSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },

        quantity: {
            type: Number,
            default: null,
            validate: {
                validator(value) {
                    return value === null || value === undefined || value >= 0.0001;
                },
                message: "La cantidad estimada debe ser mayor a 0.",
            },
        },

        unit: {
            type: String,
            required: true,
            trim: true,
            enum: UNIT_VALUES,
        },

        isMain: {
            type: Boolean,
            default: false,
        },

        isWaste: {
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

const productionTemplateSchema = new Schema(
    {
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

        description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        category: {
            type: Schema.Types.ObjectId,
            ref: "Category",
            default: null,
        },

        type: {
            type: String,
            required: true,
            enum: PRODUCTION_TEMPLATE_TYPES,
            default: "transformation",
        },

        baseUnit: {
            type: String,
            required: true,
            trim: true,
            enum: UNIT_VALUES,
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
            enum: DESTINATION_TYPES,
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

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        inputs: {
            type: [productionTemplateInputSchema],
            validate: {
                validator: function (value) {
                    return Array.isArray(value) && value.length > 0;
                },
                message: "La ficha debe tener al menos un insumo.",
            },
            required: true,
        },

        outputs: {
            type: [productionTemplateOutputSchema],
            validate: {
                validator: function (value) {
                    return Array.isArray(value) && value.length > 0;
                },
                message: "La ficha debe tener al menos un resultado.",
            },
            required: true,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

productionTemplateSchema.pre("validate", function () {
    if (!this.inputs || this.inputs.length === 0) {
        throw new Error("La ficha debe incluir al menos un insumo.");
    }

    if (!this.outputs || this.outputs.length === 0) {
        throw new Error("La ficha debe incluir al menos un resultado.");
    }

    const primaryInputs = this.inputs.filter((item) => item.isPrimary);
    const mainOutputs = this.outputs.filter((item) => item.isMain);

    if (this.type === "cutting" && primaryInputs.length !== 1) {
        throw new Error("Las fichas de despiece deben tener exactamente un insumo principal.");
    }

    if (mainOutputs.length === 0) {
        throw new Error("Debe existir al menos un resultado principal.");
    }

    const duplicatedInputs = new Set();
    for (const input of this.inputs) {
        const key = `${input.productId}-${input.unit}`;
        if (duplicatedInputs.has(key)) {
            throw new Error("No se puede repetir el mismo producto en los insumos.");
        }
        duplicatedInputs.add(key);
    }

    const duplicatedOutputs = new Set();
    for (const output of this.outputs) {
        const key = `${output.productId}-${output.unit}`;
        if (duplicatedOutputs.has(key)) {
            throw new Error("No se puede repetir el mismo producto en los resultados.");
        }
        duplicatedOutputs.add(key);

        if (output.isWaste && output.isMain) {
            throw new Error("Un resultado no puede ser merma y principal al mismo tiempo.");
        }
    }

    if (!this.allowsMultipleOutputs) {
        const nonWasteOutputs = this.outputs.filter((item) => !item.isWaste);
        if (nonWasteOutputs.length > 1) {
            throw new Error("Esta ficha no permite múltiples resultados de salida.");
        }
    }
});

const ProductionTemplate =
    models.ProductionTemplate ||
    model("ProductionTemplate", productionTemplateSchema);

export default ProductionTemplate;