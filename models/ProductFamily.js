import { Schema, model, models } from "mongoose";
import { slugify } from "@libs/slugify";

const productFamilySchema = new Schema(
    {
        name: {
            type: String,
            required: [true, "Family name is required."],
            trim: true,
            maxlength: [80, "Family name cannot exceed 80 characters."],
        },
        slug: {
            type: String,
            required: [true, "Family slug is required."],
            trim: true,
            lowercase: true,
            unique: true,
            maxlength: [100, "Family slug cannot exceed 100 characters."],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [250, "Description cannot exceed 250 characters."],
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

productFamilySchema.pre("validate", function () {
    if (this.name && !this.slug) {
        this.slug = slugify(this.name);
    }

    if (this.slug) {
        this.slug = slugify(this.slug);
    }
});

productFamilySchema.index({ name: 1 });
productFamilySchema.index({ slug: 1 }, { unique: true });

const ProductFamily =
    models.ProductFamily || model("ProductFamily", productFamilySchema);

export default ProductFamily;
