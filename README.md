# Dishpatch: Food Ordering & Delivery Platform

A full stack food delivery app built with **MongoDB, Express, React and Node.js**, with **live order tracking over WebSockets**.
Customers find restaurants near them, customise dishes, apply coupons and watch their rider move on a map. Restaurant owners run a live
order board. Delivery partners pick up and deliver orders. Three roles, one real-time system.

## Features

**Customer**
- Restaurants near you: MongoDB geospatial search (`$geoNear` on a `2dsphere` index) filtered by delivery radius, sorted by rating, distance, speed or price
- Search, cuisine chips, pure-veg filter, pagination (state lives in the URL)
- Menus with veg/non-veg marks, bestsellers, sold-out dishes and **customisable dishes** (required choices such as Size, optional add-ons with limits)
- Single-restaurant cart (switching restaurants asks first), persisted in localStorage
- Checkout with a **map pin** for the delivery spot, **distance-based delivery fee and ETA**, coupon codes and a live price breakdown
- **Live tracking page**: status stepper, map with the restaurant, your address and the rider's moving position, rider name and phone
- Order history, cancel before the restaurant accepts, rate and review after delivery

**Restaurant owner**
- **Live order board** that updates the instant an order arrives (with a chime), then Accept / Decline, Start preparing, Mark ready
- Menu manager with an option-group editor, sold-out toggle and bestseller flag
- Offers: percentage, flat or free-delivery coupons with minimum order, caps, usage limits and expiry
- Overview: today's orders and revenue, 7-day revenue chart, best sellers; open/closed switch

**Delivery partner**
- Live list of accepted orders waiting for a rider, one-tap accept (only one rider can win a race)
- Pickup and delivery steps, earnings and distance totals
- Shares live location while out for delivery: a built-in **ride simulator** for demos, or real GPS

## Engineering highlights

- **Real-time with Socket.IO**: authenticated sockets join private rooms (`user:<id>`, `restaurant:<id>`, `riders`), so a customer only hears about their own orders and an owner only about their own restaurant. REST stays the source of truth, sockets push the changes
- **Order state machine**: one table of allowed transitions per actor (restaurant, rider, customer). Every transition is a conditional atomic update (`findOneAndUpdate` with the current status in the filter), so double clicks and races cannot skip or repeat a step
- **Race-safe claiming**: `rider: null` is part of the update condition, so when five riders tap Accept together exactly one wins. Same idea for the last redemption of a limited coupon. Both are covered by concurrent tests
- **Server-side pricing**: the client sends item ids, option names, quantities, a coupon code and a location. Item prices, option prices, GST, delivery fee, discounts and totals are all recomputed from the database; the client only displays the server's `quote`
- **Coupon engine**: validity window, restaurant scoping, minimum order, global and per-customer limits, percent caps, released again when an order is cancelled or declined
- Option-group validation on the server (required, min/max, unknown or duplicate options) and per-field, human-readable validation messages (Zod)
- JWT auth with bcrypt, role-based access (`customer` / `owner` / `rider`), ownership checks that return 404 (not 403) so ids cannot be probed, Helmet, CORS allow-list, rate-limited auth routes, regex-escaped search
- Reviews tied to a delivered order (one per order, enforced by a unique index); the restaurant's average is recomputed with an aggregation
- React: Context + `useReducer` cart, abortable data hook, socket hook, role-based route guards, code-split owner and rider areas
- **60 automated tests**: 54 API integration tests (Vitest, Supertest, in-memory MongoDB, plus a real Socket.IO client) and 6 cart unit tests

## Tech stack

| Layer     | Tools |
|-----------|-------|
| Frontend  | React 19, React Router, Vite, Leaflet / react-leaflet (OpenStreetMap), Socket.IO client, plain CSS |
| Backend   | Node.js, Express 4, Mongoose 8, Socket.IO, Zod, JSON Web Tokens, bcryptjs, Helmet |
| Database  | MongoDB (geospatial `2dsphere` index, aggregations) |
| Testing   | Vitest, Supertest, mongodb-memory-server, socket.io-client |

## Project structure

```
dishpatch/
├── CREDITS.md             photo credits (author + licence per image)
├── server/
│   ├── src/
│   │   ├── config/        env + DB connection
│   │   ├── models/        User, Restaurant, MenuItem, Coupon, Order, Review
│   │   ├── controllers/   auth, restaurant (public), order (customer), owner, rider
│   │   ├── services/      quoteService (pricing), couponService
│   │   ├── realtime/      Socket.IO setup, rooms and emit helpers
│   │   ├── routes/        route table (auth, role, validation, controller)
│   │   ├── middleware/    auth + requireRole, validate, error handling
│   │   ├── validators/    Zod schemas
│   │   ├── utils/         pricing, geo (haversine), order state machine
│   │   └── seed/          demo catalogue: 10 restaurants, 71 dishes, coupons, reviews
│   └── tests/             API + realtime integration tests
└── client/
    └── src/
        ├── api/           fetch wrapper, socket connection
        ├── context/       Auth, Cart (reducer), Location, Toast
        ├── hooks/         useApi, useSocketEvents
        ├── components/    Navbar, RestaurantCard, OptionsModal, Maps, OrderStepper, route guards, ...
        └── pages/         customer pages, pages/owner/*, pages/rider/*
```

## Getting started

### Prerequisites
- **Node.js 18+**
- **MongoDB**: a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster, or a local install

### 1. API
```bash
cd server
npm install
cp .env.example .env        # then put your MongoDB connection string in MONGO_URI
npm run seed                # demo restaurants, dishes, coupons, reviews, accounts (wipes all data!)
npm run dev                 # http://localhost:5000 (REST + WebSocket on the same port)
```

### 2. Web app
```bash
cd client
npm install
npm run dev                 # http://localhost:5173 (proxies /api and /socket.io to the server)
```

### Demo accounts (created by `npm run seed`)
| Role              | Email                    | Password      |
|-------------------|--------------------------|---------------|
| Customer          | customer@dishpatch.dev   | Customer@123  |
| Restaurant owner  | owner@dishpatch.dev      | Owner@12345   |
| Delivery partner  | rider@dishpatch.dev      | Rider@12345   |

`owner@dishpatch.dev` runs *Spice Route Biryani House*. Nine more restaurants are owned by `owner2@dishpatch.dev` to `owner10@dishpatch.dev` (same password).
The login page has one-click buttons for the three demo roles.

### Try the live flow (about 2 minutes)
Open three browser windows (use a private window for one, since the login is stored per browser profile):
1. **Owner**: log in as the owner and stay on *Live orders*.
2. **Rider**: log in as the rider and stay on *Deliveries*.
3. **Customer**: order from *Spice Route Biryani House* (try *Large* + *Extra raita*, and the code `WELCOME50`).
4. Watch the order pop up on the owner's board. Click *Accept*, then the rider's screen offers it. Accept it as the rider, then *Start preparing* and *Mark ready* as the owner.
5. As the rider, click *I have picked up the order*, then *Simulate the ride*. The customer's map moves live. Finish with *Mark as delivered* and leave a review as the customer.

### Environment variables (`server/.env`)
| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string (32+ chars). **Required in production** |
| `CLIENT_URL` | Allowed browser origin(s) for CORS and Socket.IO, comma separated |
| `DEMO_*_PASSWORD` | Passwords the seed script gives the demo accounts. **Change these before deploying** |

Client: `VITE_API_URL` (empty in development; in production the URL of your deployed API).

## Running the tests
```bash
cd server && npm test       # 54 tests, temporary in-memory MongoDB (first run downloads the mongod binary)
cd client && npm test       # 6 cart reducer tests
```

## API reference

All routes are under `/api`. Roles: 🙂 customer, 🍳 owner, 🛵 rider.

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register`, `/auth/login` | Create account (role `customer`, `owner` or `rider`) / log in, returns `{ user, token }` |
| GET / PUT | `/auth/me`, `/auth/profile` | Current user / update name, phone or password |
| GET | `/restaurants` | List. Query: `q, cuisine, pureVeg, sort(rating\|eta\|price\|distance), lat, lng, page, limit`. With `lat,lng`: only restaurants that deliver there, with `distanceKm`, `etaMins` |
| GET | `/restaurants/cuisines` | Distinct cuisines |
| GET | `/restaurants/:id` | Restaurant, full menu, usable coupons, latest reviews |
| POST | `/orders/quote` 🙂 | Server-side price breakdown for a cart: subtotal, discount, delivery fee, GST, total, ETA |
| POST | `/orders` 🙂 | Place an order (same body plus `address`, `note`) |
| GET | `/orders/mine` 🙂 · `/orders/:id` | My orders · one order (customer, its restaurant's owner or its rider) |
| PUT | `/orders/:id/cancel` 🙂 | Cancel while still `placed` |
| POST | `/orders/:id/review` 🙂 | Rate a delivered order (once) |
| GET/POST/PUT | `/owner/restaurant` 🍳 | Get / create / update my restaurant (including open/closed) |
| GET/POST/PUT/DELETE | `/owner/menu`, `/owner/menu/:id` 🍳 | Manage dishes and option groups |
| GET/POST/PUT/DELETE | `/owner/coupons`, `/owner/coupons/:id` 🍳 | Manage offers |
| GET | `/owner/orders` 🍳 | Orders (`active=true` or `status=`) |
| PUT | `/owner/orders/:id/status` 🍳 | `accepted`, `rejected`, `preparing`, `ready` |
| GET | `/owner/stats` 🍳 | Today, 7-day revenue, best sellers |
| GET | `/rider/orders/available` 🛵 | Accepted orders nobody has claimed |
| POST | `/rider/orders/:id/claim` 🛵 | Take an order (atomic: one rider wins) |
| PUT | `/rider/orders/:id/status` 🛵 | `picked_up`, `delivered` |
| PUT | `/rider/orders/:id/location` 🛵 | Report position while out for delivery |
| GET | `/rider/orders/mine` 🛵 | Active deliveries, history, earnings |

Socket.IO events (server to client, authenticated with the JWT): `order:new` (owner), `order:update` (customer, owner, rider),
`order:available` / `order:unavailable` (riders), `order:location` (customer, owner).

Errors are JSON: `{ "message": "...", "details": [{ "field": "...", "message": "..." }] }`.

### Pricing rules
Items total (with chosen options), minus any coupon, plus a delivery fee (**₹25 for the first 2 km, ₹8 for each further started km**, free with a
free-delivery coupon), plus **5% GST** on the discounted food total. ETA is the restaurant's prep time plus riding time at 22 km/h plus 5 minutes.
Defined in `server/src/utils/pricing.js`.

## Deployment (free tier)

1. **Database:** create a MongoDB Atlas cluster, allow network access, copy the connection string.
2. **API on Render** (Web Service, root directory `server`): build `npm install`, start `npm start`. Set `NODE_ENV=production`, `MONGO_URI`, a strong `JWT_SECRET`, and `CLIENT_URL` (your Vercel URL).
   Render supports WebSockets, so Socket.IO works on the same service. Seed once from your machine with `MONGO_URI=<atlas uri> npm run seed -- --force`.
3. **Web on Vercel** (root directory `client`): set `VITE_API_URL` to your Render URL (no trailing slash). `vercel.json` already rewrites all routes to `index.html`.

Free Render services sleep when idle, so the first request after a pause takes a while to wake up.

Add the live links and a few screenshots here once deployed. They make a big difference on a CV.

## Design notes and trade-offs
- **REST is the source of truth, sockets are a nudge.** Every screen loads its data over REST and re-fetches or merges when a socket event arrives. If a socket drops, a refresh always shows the right state
- **Inventory is not tracked.** Restaurants mark dishes sold out by hand. A per-dish stock counter would need the same conditional-update pattern used for coupons
- **Cash on delivery only.** Online payments are the natural next step (Razorpay or Stripe with signature verification, as in the ShopSphere project)
- **Demo photos** are hot-linked from Wikimedia Commons (free licences) and credited in [CREDITS.md](CREDITS.md). The restaurants and dishes are fictional, so a few photos are close matches rather than the exact dish. A real deployment would upload and serve its own images (Cloudinary or S3)
- **Map tiles** come from the public OpenStreetMap servers, which is fine for a demo. A production app should use a tile provider with an API key
- **Distances are straight-line (haversine)**, not road routes. A routing API (OSRM, Google Directions) would give real road distance and ETA
- **Token storage:** the JWT is kept in `localStorage` and sent as a Bearer header, which keeps cross-origin deployment simple. The trade-off is XSS exposure; an httpOnly cookie + CSRF token is the next hardening step
- **Rider location** is a REST update every couple of seconds, stored on the order and pushed to the customer. A production system would use a dedicated location stream and throttle by distance

## Ideas for next steps
Online payments, push notifications, address book, dish photo uploads (Cloudinary), order scheduling, rider matching by distance, Redis for socket scaling, Docker + docker-compose, and Playwright end-to-end tests.
