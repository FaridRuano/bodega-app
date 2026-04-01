import { Schema, model, models } from "mongoose";
import { slugify } from "@libs/slugify";

export const PRODUCT_UNITS = [
    "unit",
    "kg",
    "g",
    "lb",
    "l",
    "ml",
    "package",
    "box",
];

export const PRODUCT_TYPES = [
    "raw_material",
    "processed",
    "prepared",
    "supply",
];

export const STORAGE_TYPES = [
    "ambient",
    "refrigerated",
    "frozen",
];

const productSchema = new Schema(
    {
        code: {
            type: String,
            trim: true,
            uppercase: true,
            maxlength: [30, "Product code cannot exceed 30 characters."],
            default: null,
        },
        name: {
            type: String,
            required: [true, "Product name is required."],
            trim: true,
            maxlength: [120, "Product name cannot exceed 120 characters."],
        },
        slug: {
            type: String,
            trim: true,
            lowercase: true,
            unique: true,
            maxlength: [140, "Product slug cannot exceed 140 characters."],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [300, "Description cannot exceed 300 characters."],
            default: "",
        },
        categoryId: {
            type: Schema.Types.ObjectId,
            ref: "Category",
            required: [true, "Category is required."],
            index: true,
        },
        unit: {
            type: String,
            enum: PRODUCT_UNITS,
            required: [true, "Product unit is required."],
            default: "unit",
        },
        productType: {
            type: String,
            enum: PRODUCT_TYPES,
            required: [true, "Product type is required."],
            default: "raw_material",
            index: true,
        },
        storageType: {
            type: String,
            enum: STORAGE_TYPES,
            required: [true, "Storage type is required."],
            default: "ambient",
        },
        tracksStock: {
            type: Boolean,
            default: true,
        },
        allowsProduction: {
            type: Boolean,
            default: false,
        },
        minStock: {
            type: Number,
            default: 0,
            min: [0, "Minimum stock cannot be negative."],
        },
        reorderPoint: {
            type: Number,
            default: 0,
            min: [0, "Reorder point cannot be negative."],
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        notes: {
            type: String,
            trim: true,
            maxlength: [500, "Notes cannot exceed 500 characters."],
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

productSchema.pre("validate", function (next) {
    if (this.name && !this.slug) {
        this.slug = slugify(this.name);
    }

    if (this.slug) {
        this.slug = slugify(this.slug);
    }
});

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ code: 1 }, { unique: true, sparse: true });
productSchema.index({ name: 1 });
productSchema.index({ categoryId: 1, isActive: 1 });
productSchema.index({ productType: 1, isActive: 1 });

const Product = models.Product || model("Product", productSchema);

export default Product;