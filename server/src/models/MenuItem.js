import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true, maxlength: 60 }, price: { type: Number, min: 0, default: 0 } },
  { _id: false }
);

// A customisation group such as "Size" (pick exactly 1) or "Add-ons" (pick 0..n).
const optionGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    min: { type: Number, min: 0, default: 0 },
    max: { type: Number, min: 1, default: 1 },
    options: { type: [optionSchema], validate: [(v) => v.length > 0 && v.length <= 12, 'A group needs 1 to 12 options'] },
  },
  { _id: false }
);

const menuItemSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true, maxlength: 40 },
    veg: { type: Boolean, default: true },
    image: { type: String, default: '' },
    available: { type: Boolean, default: true },
    popular: { type: Boolean, default: false },
    optionGroups: { type: [optionGroupSchema], default: [] },
  },
  { timestamps: true }
);

export const MenuItem = mongoose.model('MenuItem', menuItemSchema);
