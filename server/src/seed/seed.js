import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { Coupon } from '../models/Coupon.js';
import { MenuItem } from '../models/MenuItem.js';
import { Order } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import { Review } from '../models/Review.js';
import { User } from '../models/User.js';
import { fromPoint, haversineKm, toPoint } from '../utils/geo.js';
import { computeTotals, deliveryFeeFor, etaMinutes, round1 } from '../utils/pricing.js';
import { itemKey, restaurants } from './catalogue.js';

if (env.isProd && !process.argv.includes('--force')) {
  console.error('Refusing to seed in production without --force (this wipes all data).');
  process.exit(1);
}

// Photos are optional: the app shows a placeholder for any dish or restaurant without one.
let restaurantPhotos = {};
let dishPhotos = {};
try {
  ({ restaurantPhotos, dishPhotos } = await import('./photos.js'));
} catch {
  console.warn('No photos.js found: seeding without images.');
}

const HOME = { lat: 22.5726, lng: 88.3639 }; // central Kolkata, used for the demo order history
const comments = {
  5: ['Absolutely loved it, arrived hot and on time.', 'Best in the area. Generous portions too.', 'Fresh, flavourful and packed really well.'],
  4: ['Really good food, delivery was a little slow.', 'Tasty and good value. Will order again.', 'Great taste, could use a bit more seasoning.'],
  3: ['Decent, but I expected a bit more for the price.', 'Okay food. Arrived lukewarm.'],
};
const pick = (arr, i) => arr[i % arr.length];

async function main() {
  await connectDB();
  await Promise.all([User, Restaurant, MenuItem, Coupon, Order, Review].map((m) => m.deleteMany({})));

  await User.create({ name: 'Riya Sen', email: 'customer@dishpatch.dev', password: env.demoPassword.customer, role: 'customer', phone: '+91 9830012345' });
  await User.create({ name: 'Arjun Das', email: 'rider@dishpatch.dev', password: env.demoPassword.rider, role: 'rider', phone: '+91 9830054321' });
  // User.create (not insertMany) so the password-hashing hook runs for every account.
  const reviewers = await User.create(
    ['Aarav Mehta', 'Priya Nair', 'Rohan Das', 'Ananya Ghosh', 'Kabir Singh', 'Meera Iyer'].map((name, i) => ({
      name,
      email: `guest${i + 1}@dishpatch.dev`,
      password: env.demoPassword.customer,
      role: 'customer',
    }))
  );

  let dishes = 0;
  const created = [];
  for (const [i, r] of restaurants.entries()) {
    // owner@dishpatch.dev owns the first restaurant; the rest are owner2@... owner10@...
    const owner = await User.create({
      name: `${r.name} Manager`,
      email: i === 0 ? 'owner@dishpatch.dev' : `owner${i + 1}@dishpatch.dev`,
      password: env.demoPassword.owner,
      role: 'owner',
    });
    const restaurant = await Restaurant.create({
      owner: owner._id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      cuisines: r.cuisines,
      image: restaurantPhotos[r.slug] || '',
      address: r.address,
      location: toPoint(r.location),
      priceForTwo: r.priceForTwo,
      prepTime: r.prepTime,
      minOrder: r.minOrder,
      pureVeg: r.pureVeg,
    });
    const menu = await MenuItem.insertMany(r.items.map(({ options, ...item }) => ({ ...item, optionGroups: options || [], restaurant: restaurant._id, image: dishPhotos[itemKey(r.slug, item.name)] || '' })));
    dishes += menu.length;
    created.push({ restaurant, menu });
  }

  // Sample coupons: two global, two restaurant-specific.
  const yearAhead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await Coupon.insertMany([
    { code: 'WELCOME50', description: '50% off your order, up to ₹100', type: 'percent', value: 50, maxDiscount: 100, minOrder: 199, expiresAt: yearAhead },
    { code: 'FREEDEL', description: 'Free delivery on orders above ₹299', type: 'free_delivery', minOrder: 299, expiresAt: yearAhead },
    { code: 'FLAT100', description: '₹100 off orders above ₹599', type: 'flat', value: 100, minOrder: 599, expiresAt: yearAhead },
    { code: 'SPICE20', restaurant: created[0].restaurant._id, description: '20% off at Spice Route, up to ₹80', type: 'percent', value: 20, maxDiscount: 80, minOrder: 300, expiresAt: yearAhead },
    { code: 'PIZZA25', restaurant: created[1].restaurant._id, description: '25% off pizzas, up to ₹120', type: 'percent', value: 25, maxDiscount: 120, minOrder: 400, usageLimit: 500, expiresAt: yearAhead },
  ]);

  // Order history with reviews so ratings and the "Reviews" section have real data behind them.
  let reviews = 0;
  for (const [ri, { restaurant, menu }] of created.entries()) {
    const distanceKm = haversineKm(fromPoint(restaurant.location), HOME);
    for (let n = 0; n < 4; n++) {
      const reviewer = reviewers[(ri + n) % reviewers.length];
      const chosen = [menu[(n * 2) % menu.length], menu[(n * 2 + 3) % menu.length]];
      const items = chosen.map((m, k) => {
        const qty = k + 1;
        return { menuItem: m._id, name: m.name, veg: m.veg, qty, options: [], unitPrice: m.price, lineTotal: m.price * qty };
      });
      const subtotal = items.reduce((s, l) => s + l.lineTotal, 0);
      const when = new Date(Date.now() - (n + 1) * 2.5 * 24 * 60 * 60 * 1000 - ri * 3600 * 1000);
      const order = await Order.create({
        customer: reviewer._id,
        restaurant: restaurant._id,
        restaurantName: restaurant.name,
        items,
        deliveryAddress: { name: reviewer.name, phone: '+91 9800000000', line: '21 Lake Road', city: 'Kolkata', pincode: '700029', location: HOME },
        distanceKm: round1(distanceKm),
        etaMins: etaMinutes(restaurant.prepTime, distanceKm),
        ...computeTotals({ subtotal, deliveryFee: deliveryFeeFor(distanceKm) }),
        status: 'delivered',
        paymentStatus: 'paid',
        statusHistory: ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered'].map((status) => ({ status, at: when })),
        deliveredAt: when,
        reviewed: true,
        createdAt: when,
        updatedAt: when,
      });
      const rating = [5, 4, 5, 4, 3][(ri + n) % 5];
      await Review.create({ restaurant: restaurant._id, user: reviewer._id, userName: reviewer.name, order: order._id, rating, comment: pick(comments[rating], ri + n), createdAt: when });
      reviews++;
    }
    await Review.recalculate(restaurant._id);
  }

  console.log(`Seeded ${created.length} restaurants, ${dishes} dishes, 5 coupons, ${reviews} reviews.`);
  console.log('Demo logins:');
  console.log(`  customer  customer@dishpatch.dev  ${env.demoPassword.customer}`);
  console.log(`  owner     owner@dishpatch.dev     ${env.demoPassword.owner}   (owns ${created[0].restaurant.name})`);
  console.log(`  rider     rider@dishpatch.dev     ${env.demoPassword.rider}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
