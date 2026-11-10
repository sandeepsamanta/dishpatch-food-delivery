import mongoose from 'mongoose';

// A review is tied to one delivered order (unique), so only real customers can rate and only once per order.
const reviewSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

/** Recomputes a restaurant's average rating from its reviews. */
reviewSchema.statics.recalculate = async function recalculate(restaurantId) {
  const [stats] = await this.aggregate([
    { $match: { restaurant: new mongoose.Types.ObjectId(String(restaurantId)) } },
    { $group: { _id: '$restaurant', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await mongoose.model('Restaurant').updateOne(
    { _id: restaurantId },
    { ratingAvg: stats ? Math.round(stats.avg * 100) / 100 : 0, ratingCount: stats?.count || 0 }
  );
};

export const Review = mongoose.model('Review', reviewSchema);
