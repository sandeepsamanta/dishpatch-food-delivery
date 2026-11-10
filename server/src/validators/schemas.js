import { z } from 'zod';
import { COUPON_TYPES } from '../models/Coupon.js';
import { ORDER_STATUSES } from '../utils/orderFlow.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const idParams = z.object({ id: objectId });

// `label` makes the message readable for the person filling in the form ("Address is required").
const trimmed = (max, min = 1, label = 'This field') =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Must be an http(s) URL');
const flag = z.preprocess((v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v), z.boolean());

export const latLng = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

// ---------- auth ----------
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Password needs a letter')
  .regex(/\d/, 'Password needs a number');

export const registerBody = z.object({
  name: trimmed(60, 2, 'Name'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  password,
  // Public sign-up may pick any of the three roles; there is no admin role to escalate to.
  role: z.enum(['customer', 'owner', 'rider']).default('customer'),
  phone: z.string().trim().max(20).optional(),
});
export const loginBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  password: z.string().min(1, 'Password is required'),
});
export const profileBody = z
  .object({ name: trimmed(60, 2, 'Name').optional(), phone: z.string().trim().max(20).optional(), currentPassword: z.string().optional(), newPassword: password.optional() })
  .refine((d) => !d.newPassword || d.currentPassword, { message: 'Enter your current password to set a new one', path: ['currentPassword'] });

// ---------- discovery ----------
export const restaurantQuery = z.object({
  q: z.string().trim().max(60).optional(),
  cuisine: z.string().trim().max(40).optional(),
  pureVeg: flag.optional(),
  sort: z.enum(['rating', 'eta', 'price', 'distance']).default('rating'),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export const restaurantDetailQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

// ---------- orders ----------
const orderLine = z.object({
  menuItem: objectId,
  qty: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(20, 'You can order at most 20 of one item'),
  options: z.array(z.object({ group: trimmed(40), name: trimmed(60) })).max(20).default([]),
});
const quoteFields = z.object({
  restaurant: objectId,
  items: z.array(orderLine).min(1, 'Your cart is empty').max(30, 'Too many items in one order'),
  couponCode: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => v || undefined),
  location: latLng,
});
export const quoteBody = quoteFields;
export const createOrderBody = quoteFields.extend({
  address: z.object({
    name: trimmed(60, 2, 'Name'),
    phone: z.string().trim().regex(/^[+\d][\d\s-]{7,16}$/, 'Enter a valid phone number'),
    line: trimmed(160, 5, 'Address'),
    city: trimmed(60, 2, 'City'),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  }),
  note: z.string().trim().max(200).optional(),
});
export const orderStatusBody = z.object({ status: z.enum(ORDER_STATUSES) });
export const riderLocationBody = latLng;
export const reviewBody = z.object({
  rating: z.coerce.number().int().min(1, 'Pick a rating from 1 to 5').max(5, 'Pick a rating from 1 to 5'),
  comment: z.string().trim().max(500).optional(),
});
export const ownerOrdersQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  active: flag.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------- owner: restaurant, menu, coupons ----------
const restaurantFields = z.object({
  name: trimmed(80, 2, 'Restaurant name'),
  description: z.string().trim().max(400),
  cuisines: z.array(trimmed(30)).max(6),
  image: imageUrl,
  address: trimmed(200, 5, 'Address'),
  location: latLng,
  priceForTwo: z.coerce.number().min(0).max(100000),
  prepTime: z.coerce.number().int().min(5).max(120),
  minOrder: z.coerce.number().min(0).max(100000),
  deliveryRadiusKm: z.coerce.number().min(1).max(30),
  pureVeg: z.boolean(),
  isOpen: z.boolean(),
});
export const restaurantBody = restaurantFields.extend({
  description: restaurantFields.shape.description.optional().default(''),
  cuisines: restaurantFields.shape.cuisines.optional().default([]),
  image: restaurantFields.shape.image.optional().default(''),
  priceForTwo: restaurantFields.shape.priceForTwo.optional().default(300),
  prepTime: restaurantFields.shape.prepTime.optional().default(25),
  minOrder: restaurantFields.shape.minOrder.optional().default(0),
  deliveryRadiusKm: restaurantFields.shape.deliveryRadiusKm.optional().default(8),
  pureVeg: restaurantFields.shape.pureVeg.optional().default(false),
  isOpen: restaurantFields.shape.isOpen.optional().default(true),
});
// Partial update: no defaults, so only the fields that were sent change.
export const restaurantUpdateBody = restaurantFields.partial();

const optionGroup = z
  .object({
    name: trimmed(40, 1, 'Group name'),
    min: z.coerce.number().int().min(0).max(12),
    max: z.coerce.number().int().min(1).max(12),
    options: z.array(z.object({ name: trimmed(60), price: z.coerce.number().min(0).max(10000) })).min(1).max(12),
  })
  .refine((g) => g.min <= g.max && g.max <= g.options.length, {
    message: 'Option group limits must satisfy min <= max <= number of options',
    path: ['max'],
  });
const menuFields = z.object({
  name: trimmed(80, 2, 'Dish name'),
  description: z.string().trim().max(300),
  price: z.coerce.number().min(0).max(100000),
  category: trimmed(40, 1, 'Category'),
  veg: z.boolean(),
  image: imageUrl,
  available: z.boolean(),
  popular: z.boolean(),
  optionGroups: z.array(optionGroup).max(6),
});
export const menuItemBody = menuFields.extend({
  description: menuFields.shape.description.optional().default(''),
  veg: menuFields.shape.veg.optional().default(true),
  image: menuFields.shape.image.optional().default(''),
  available: menuFields.shape.available.optional().default(true),
  popular: menuFields.shape.popular.optional().default(false),
  optionGroups: menuFields.shape.optionGroups.optional().default([]),
});
export const menuItemUpdateBody = menuFields.partial();

const couponFields = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9]{3,20}$/, 'Use 3-20 letters or digits for the code'),
  description: z.string().trim().max(140),
  type: z.enum(COUPON_TYPES),
  value: z.coerce.number().min(0).max(100000),
  maxDiscount: z.coerce.number().min(0).max(100000),
  minOrder: z.coerce.number().min(0).max(100000),
  usageLimit: z.coerce.number().int().min(0).max(1000000),
  expiresAt: z.coerce.date().nullable(),
  active: z.boolean(),
});
export const couponBody = couponFields.extend({
  description: couponFields.shape.description.optional().default(''),
  value: couponFields.shape.value.optional().default(0),
  maxDiscount: couponFields.shape.maxDiscount.optional().default(0),
  minOrder: couponFields.shape.minOrder.optional().default(0),
  usageLimit: couponFields.shape.usageLimit.optional().default(0),
  expiresAt: couponFields.shape.expiresAt.optional().default(null),
  active: couponFields.shape.active.optional().default(true),
});
export const couponUpdateBody = couponFields.omit({ code: true }).partial();
