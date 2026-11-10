import mongoose from 'mongoose';
import { ORDER_STATUSES } from '../utils/orderFlow.js';

const lineSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    veg: { type: Boolean, default: true },
    qty: { type: Number, required: true, min: 1 },
    options: [{ _id: false, group: String, name: String, price: Number }],
    unitPrice: { type: Number, required: true, min: 0 }, // base price + chosen options, computed on the server
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const latLngDef = { lat: { type: Number, required: true }, lng: { type: Number, required: true } };
const latLngSchema = new mongoose.Schema(latLngDef, { _id: false });

const orderSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    restaurantName: { type: String, required: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    items: { type: [lineSchema], validate: [(v) => v.length > 0, 'An order needs at least one item'] },
    deliveryAddress: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      line: { type: String, required: true },
      city: { type: String, required: true },
      pincode: { type: String, required: true },
      location: { type: latLngSchema, required: true },
    },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    distanceKm: { type: Number, required: true },
    etaMins: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, default: null },
    deliveryFee: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['cod'], default: 'cod' },
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    status: { type: String, enum: ORDER_STATUSES, default: 'placed', index: true },
    statusHistory: [{ _id: false, status: String, at: { type: Date, default: Date.now } }],
    riderLocation: { type: new mongoose.Schema({ ...latLngDef, updatedAt: Date }, { _id: false }), default: null },
    reviewed: { type: Boolean, default: false },
    deliveredAt: Date,
  },
  { timestamps: true }
);

orderSchema.index({ restaurant: 1, status: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
