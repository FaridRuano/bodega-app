import mongoose, { Schema, models, model } from "mongoose";
import { slugify } from "@libs/slugify";

const categorySchema = new Schema(
    {
        name: {
            type: String,
            required: [true, "Category name is required."],
            trim: true,
            maxlength: [80, "Category name cannot exceed 80 characters."],
        },
        slug: {
            type: String,
            required: [true, "Category slug is required."],
            trim: true,
            lowercase: true,
            unique: true,
            maxlength: [100, "Category slug cannot exceed 100 characters."],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [250, "Description cannot exceed 250 characters."],
            default: "",
        },
        familyId: {
            type: Schema.Types.ObjectId,
            ref: "ProductFamily",
            default: null,
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        sortOrder: {
            type: Number,
            default: 0,
            min: [0, "Sort order cannot be negative."],
        },
    },
    {
        timestamps: true,
    }
);

categorySchema.pre("validate", function () {
    if (this.name && !this.slug) {
        this.slug = slugify(this.name);
    }

    if (this.slug) {
        this.slug = slugify(this.slug);
    }
});

categorySchema.index({ name: 1 });
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ familyId: 1, isActive: 1 });

const Category = models.Category || model("Category", categorySchema);

export default Category;
