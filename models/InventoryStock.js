import { Schema, model, models } from "mongoose";

export const STOCK_LOCATIONS = [
    "warehouse",
    "kitchen",
];

const inventoryStockSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: [true, "Product is required."],
            index: true,
        },
        location: {
            type: String,
            enum: STOCK_LOCATIONS,
            required: [true, "Location is required."],
            index: true,
        },
        quantity: {
            type: Number,
            required: [true, "Quantity is required."],
            default: 0,
            min: [0, "Quantity cannot be negative."],
        },
        reservedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Reserved quantity cannot be negative."],
        },
        availableQuantity: {
            type: Number,
            default: 0,
            min: [0, "Available quantity cannot be negative."],
        },
        lastMovementAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

inventoryStockSchema.pre("validate", function (next) {
    const quantity = Number(this.quantity || 0);
    const reservedQuantity = Number(this.reservedQuantity || 0);

    this.availableQuantity = Math.max(quantity - reservedQuantity, 0);
});

inventoryStockSchema.index(
    { productId: 1, location: 1 },
    { unique: true }
);

inventoryStockSchema.index({ location: 1, productId: 1 });

const InventoryStock =
    models.InventoryStock || model("InventoryStock", inventoryStockSchema);

export default InventoryStock;