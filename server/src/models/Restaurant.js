import mongoose from 'mongoose';
import { fromPoint, toPoint } from '../utils/geo.js';
import { etaMinutes, round1 } from '../utils/pricing.js';

const restaurantSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true },
    description: { type: String, trim: true, maxlength: 400, default: '' },
    cuisines: { type: [String], default: [] },
    image: { type: String, default: '' },
    address: { type: String, required: true, trim: true, maxlength: 200 },
    // GeoJSON so MongoDB can run $geoNear on it. The API exposes it as { lat, lng }.
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    priceForTwo: { type: Number, min: 0, default: 300 },
    prepTime: { type: Number, min: 5, max: 120, default: 25 }, // minutes
    minOrder: { type: Number, min: 0, default: 0 },
    deliveryRadiusKm: { type: Number, min: 1, max: 30, default: 8 },
    pureVeg: { type: Boolean, default: false },
    isOpen: { type: Boolean, default: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

restaurantSchema.index({ location: '2dsphere' });
restaurantSchema.index({ ratingAvg: -1, ratingCount: -1 });

/** Public shape: works for documents, lean objects and $geoNear results alike. */
export function restaurantView(r) {
  const o = typeof r.toObject === 'function' ? r.toObject() : { ...r };
  const view = { ...o, location: o.location?.coordinates ? fromPoint(o.location) : o.location };
  delete view.__v;
  delete view.owner; // an internal user id: no client needs it
  view.ratingAvg = Math.round((o.ratingAvg || 0) * 10) / 10;
  if (typeof o.distanceKm === 'number') {
    view.distanceKm = round1(o.distanceKm);
    view.etaMins = etaMinutes(o.prepTime, o.distanceKm);
    view.deliverable = o.distanceKm <= o.deliveryRadiusKm;
  }
  return view;
}

restaurantSchema.set('toJSON', { transform: (_doc, ret) => restaurantView({ ...ret }) });

export const geoFromBody = (loc) => toPoint(loc);

export const Restaurant = mongoose.model('Restaurant', restaurantSchema);
