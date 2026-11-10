import { Coupon } from '../models/Coupon.js';
import { MenuItem } from '../models/MenuItem.js';
import { Restaurant, restaurantView } from '../models/Restaurant.js';
import { Review } from '../models/Review.js';
import { AppError } from '../utils/AppError.js';
import { fromPoint, haversineKm } from '../utils/geo.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  rating: { ratingAvg: -1, ratingCount: -1, _id: 1 },
  eta: { prepTime: 1, _id: 1 },
  price: { priceForTwo: 1, _id: 1 },
  distance: { distanceKm: 1, _id: 1 },
};

/**
 * GET /restaurants. With lat/lng it runs a MongoDB $geoNear (2dsphere index), keeps only restaurants that
 * deliver to that point and can sort by distance; without them it is a plain filtered query.
 */
export async function listRestaurants(req, res) {
  const { q, cuisine, pureVeg, sort, lat, lng, page, limit } = req.query;

  const filter = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { cuisines: rx }];
  }
  if (cuisine) filter.cuisines = cuisine;
  if (pureVeg) filter.pureVeg = true;

  const skip = (page - 1) * limit;

  if (lat !== undefined && lng !== undefined) {
    const stages = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distanceKm',
          distanceMultiplier: 0.001, // metres to km
          spherical: true,
          query: filter,
        },
      },
      { $match: { $expr: { $lte: ['$distanceKm', '$deliveryRadiusKm'] } } },
    ];
    const [rows, count] = await Promise.all([
      Restaurant.aggregate([...stages, { $sort: SORTS[sort] }, { $skip: skip }, { $limit: limit }]),
      Restaurant.aggregate([...stages, { $count: 'n' }]),
    ]);
    const total = count[0]?.n || 0;
    return res.json({ restaurants: rows.map(restaurantView), page, pages: Math.ceil(total / limit), total });
  }

  const [rows, total] = await Promise.all([
    Restaurant.find(filter)
      .sort(sort === 'distance' ? SORTS.rating : SORTS[sort])
      .skip(skip)
      .limit(limit)
      .lean(),
    Restaurant.countDocuments(filter),
  ]);
  res.json({ restaurants: rows.map(restaurantView), page, pages: Math.ceil(total / limit), total });
}

export async function listCuisines(_req, res) {
  const cuisines = (await Restaurant.distinct('cuisines')).sort();
  res.json({ cuisines });
}

export async function getRestaurant(req, res) {
  const restaurant = await Restaurant.findById(req.params.id).lean();
  if (!restaurant) throw new AppError('Restaurant not found', 404);

  const view = restaurantView(restaurant);
  const { lat, lng } = req.query;
  if (lat !== undefined && lng !== undefined) {
    const km = haversineKm(fromPoint(restaurant.location), { lat, lng });
    Object.assign(view, restaurantView({ ...restaurant, distanceKm: km }));
  }

  const now = new Date();
  const [menu, coupons, reviews] = await Promise.all([
    MenuItem.find({ restaurant: restaurant._id }).sort({ category: 1, popular: -1, name: 1 }).lean(),
    Coupon.find({
      active: true,
      $or: [{ restaurant: null }, { restaurant: restaurant._id }],
      $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
    })
      .select('code description type value maxDiscount minOrder usageLimit usedCount expiresAt restaurant')
      .lean(),
    Review.find({ restaurant: restaurant._id }).sort({ createdAt: -1 }).limit(15).select('userName rating comment createdAt').lean(),
  ]);

  res.json({
    restaurant: view,
    menu,
    coupons: coupons.filter((c) => c.usageLimit === 0 || c.usedCount < c.usageLimit),
    reviews,
  });
}
