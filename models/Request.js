import { Schema, model, models } from "mongoose";
import { STOCK_LOCATIONS } from "./InventoryStock";

export const REQUEST_TYPES = [
    "production",
    "operation",
    "return",
];

export const REQUEST_STATUSES = [
    "pending",
    "approved",
    "partially_fulfilled",
    "fulfilled",
    "cancelled",
    "rejected",
];

export const REQUEST_ACTIVITY_TYPES = [
    "request_created",
    "approved",
    "dispatch",
    "receive",
    "rejected",
    "cancelled",
    "edited",
];

const requestItemSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: [true, "Product is required."],
        },

        unitSnapshot: {
            type: String,
            required: [true, "Unit snapshot is required."],
            trim: true,
        },

        requestedQuantity: {
            type: Number,
            required: [true, "Requested quantity is required."],
            min: [0.000001, "Requested quantity must be greater than zero."],
        },

        approvedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Approved quantity cannot be negative."],
        },

        dispatchedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Dispatched quantity cannot be negative."],
        },

        receivedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Received quantity cannot be negative."],
        },

        returnedQuantity: {
            type: Number,
            default: 0,
            min: [0, "Returned quantity cannot be negative."],
        },

        notes: {
            type: String,
            trim: true,
            maxlength: [250, "Item notes cannot exceed 250 characters."],
            default: "",
        },
    },
    {
        _id: true,
        timestamps: false,
    }
);

const movementItemSchema = new Schema(
    {
        requestItemId: {
            type: Schema.Types.ObjectId,
            required: [true, "Request item id is required."],
        },

        quantity: {
            type: Number,
            required: [true, "Quantity is required."],
            min: [0.000001, "Quantity must be greater than zero."],
        },
    },
    {
        _id: false,
        timestamps: false,
    }
);

const dispatchSchema = new Schema(
    {
        dispatchedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Dispatch user is required."],
            index: true,
        },

        dispatchedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: [300, "Dispatch notes cannot exceed 300 characters."],
            default: "",
        },

        items: {
            type: [movementItemSchema],
            validate: {
                validator: function (items) {
                    return Array.isArray(items) && items.length > 0;
                },
                message: "At least one dispatched item is required.",
            },
        },
    },
    {
        _id: true,
        timestamps: false,
    }
);

const receiptSchema = new Schema(
    {
        receivedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Receive user is required."],
            index: true,
        },

        receivedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: [300, "Receipt notes cannot exceed 300 characters."],
            default: "",
        },

        items: {
            type: [movementItemSchema],
            validate: {
                validator: function (items) {
                    return Array.isArray(items) && items.length > 0;
                },
                message: "At least one received item is required.",
            },
        },
    },
    {
        _id: true,
        timestamps: false,
    }
);

const activityLogSchema = new Schema(
    {
        type: {
            type: String,
            enum: REQUEST_ACTIVITY_TYPES,
            required: [true, "Activity type is required."],
            index: true,
        },

        performedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Activity user is required."],
            index: true,
        },

        performedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        title: {
            type: String,
            trim: true,
            maxlength: [120, "Activity title cannot exceed 120 characters."],
            default: "",
        },

        description: {
            type: String,
            trim: true,
            maxlength: [500, "Activity description cannot exceed 500 characters."],
            default: "",
        },

        items: {
            type: [movementItemSchema],
            default: [],
        },
    },
    {
        _id: true,
        timestamps: false,
    }
);

const requestSchema = new Schema(
    {
        requestNumber: {
            type: String,
            trim: true,
            uppercase: true,
            unique: true,
            sparse: true,
            index: true,
        },

        requestType: {
            type: String,
            enum: REQUEST_TYPES,
            required: [true, "Request type is required."],
            default: "operation",
            index: true,
        },

        status: {
            type: String,
            enum: REQUEST_STATUSES,
            required: [true, "Request status is required."],
            default: "pending",
            index: true,
        },

        sourceLocation: {
            type: String,
            enum: STOCK_LOCATIONS,
            required: [true, "Source location is required."],
            default: "warehouse",
            index: true,
        },

        destinationLocation: {
            type: String,
            enum: STOCK_LOCATIONS,
            required: [true, "Destination location is required."],
            default: "kitchen",
            index: true,
        },

        requestedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Requested by user is required."],
            index: true,
        },

        approvedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        rejectedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        cancelledBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        items: {
            type: [requestItemSchema],
            validate: {
                validator: function (items) {
                    return Array.isArray(items) && items.length > 0;
                },
                message: "At least one request item is required.",
            },
        },

        dispatches: {
            type: [dispatchSchema],
            default: [],
        },

        receipts: {
            type: [receiptSchema],
            default: [],
        },

        activityLog: {
            type: [activityLogSchema],
            default: [],
        },

        justification: {
            type: String,
            trim: true,
            maxlength: [500, "Justification cannot exceed 500 characters."],
            default: "",
        },

        notes: {
            type: String,
            trim: true,
            maxlength: [500, "Notes cannot exceed 500 characters."],
            default: "",
        },

        requestedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        approvedAt: {
            type: Date,
            default: null,
        },

        cancelledAt: {
            type: Date,
            default: null,
        },

        rejectedAt: {
            type: Date,
            default: null,
        },

        statusReason: {
            type: String,
            trim: true,
            maxlength: [300, "Status reason cannot exceed 300 characters."],
            default: "",
        },

        deletedAt: {
            type: Date,
            default: null,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

requestSchema.index({ requestType: 1, status: 1 });
requestSchema.index({ requestedBy: 1, requestedAt: -1 });
requestSchema.index({ sourceLocation: 1, destinationLocation: 1, status: 1 });
requestSchema.index({ deletedAt: 1, status: 1 });

requestSchema.virtual("totals").get(function () {
    const items = this.items || [];

    return items.reduce(
        (acc, item) => {
            acc.requested += Number(item.requestedQuantity || 0);
            acc.approved += Number(item.approvedQuantity || 0);
            acc.dispatched += Number(item.dispatchedQuantity || 0);
            acc.received += Number(item.receivedQuantity || 0);
            acc.returned += Number(item.returnedQuantity || 0);
            return acc;
        },
        {
            requested: 0,
            approved: 0,
            dispatched: 0,
            received: 0,
            returned: 0,
        }
    );
});

requestSchema.methods.recalculateStatus = function () {
    if (this.status === "cancelled" || this.status === "rejected") {
        return this.status;
    }

    const items = this.items || [];

    if (this.requestType === "return") {
        const totalRequested = items.reduce(
            (sum, item) => sum + Number(item.requestedQuantity || 0),
            0
        );

        const totalDispatched = items.reduce(
            (sum, item) => sum + Number(item.dispatchedQuantity || 0),
            0
        );

        const totalReceived = items.reduce(
            (sum, item) => sum + Number(item.receivedQuantity || 0),
            0
        );

        if (totalRequested <= 0) {
            this.status = "pending";
            return this.status;
        }

        if (totalReceived >= totalRequested) {
            this.status = "fulfilled";
            return this.status;
        }

        if (totalDispatched > 0 || totalReceived > 0) {
            this.status = "partially_fulfilled";
            return this.status;
        }

        this.status = "pending";
        return this.status;
    }

    const totalApproved = items.reduce(
        (sum, item) => sum + Number(item.approvedQuantity || 0),
        0
    );

    const totalDispatched = items.reduce(
        (sum, item) => sum + Number(item.dispatchedQuantity || 0),
        0
    );

    const totalReceived = items.reduce(
        (sum, item) => sum + Number(item.receivedQuantity || 0),
        0
    );

    if (totalApproved <= 0) {
        this.status = "pending";
        return this.status;
    }

    if (totalReceived >= totalApproved) {
        this.status = "fulfilled";
        return this.status;
    }

    if (totalDispatched > 0 || totalReceived > 0) {
        this.status = "partially_fulfilled";
        return this.status;
    }

    this.status = "approved";
    return this.status;
};

requestSchema.methods.addActivity = function ({
    type,
    performedBy,
    performedAt = new Date(),
    title = "",
    description = "",
    items = [],
}) {
    if (!this.activityLog) {
        this.activityLog = [];
    }

    this.activityLog.push({
        type,
        performedBy,
        performedAt,
        title,
        description,
        items,
    });
};

requestSchema.set("toJSON", { virtuals: true });
requestSchema.set("toObject", { virtuals: true });

if (models.Request) {
    delete models.Request;
}

const Request = model("Request", requestSchema);

export default Request;
