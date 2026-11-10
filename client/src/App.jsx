import { Suspense, lazy } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Empty, Spinner } from './components/Feedback';
import LocationModal from './components/LocationModal';
import Navbar from './components/Navbar';
import { RequireRole } from './components/RouteGuards';
import Checkout from './pages/Checkout';
import Home from './pages/Home';
import { Login, Register } from './pages/Auth';
import MyOrders from './pages/MyOrders';
import OrderTracking from './pages/OrderTracking';
import Restaurant from './pages/Restaurant';

// Owner and rider areas are only needed by those roles, so they load on demand.
const OwnerLayout = lazy(() => import('./pages/owner/OwnerLayout'));
const LiveOrders = lazy(() => import('./pages/owner/LiveOrders'));
const Overview = lazy(() => import('./pages/owner/Overview'));
const MenuManager = lazy(() => import('./pages/owner/MenuManager'));
const Offers = lazy(() => import('./pages/owner/Offers'));
const RestaurantSettings = lazy(() => import('./pages/owner/RestaurantSettings'));
const RiderHub = lazy(() => import('./pages/rider/RiderHub'));

const NotFound = () => (
  <div className="container page">
    <Empty icon="🧭" title="Page not found">
      <Link className="btn btn-primary" to="/">Back to restaurants</Link>
    </Empty>
  </div>
);

export default function App() {
  return (
    <>
      <Navbar />
      <LocationModal />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/restaurants/:id" element={<Restaurant />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<RequireRole role="customer" />}>
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<MyOrders />} />
            <Route path="/orders/:id" element={<OrderTracking />} />
          </Route>

          <Route element={<RequireRole role="owner" />}>
            <Route path="/owner" element={<OwnerLayout />}>
              <Route index element={<LiveOrders />} />
              <Route path="overview" element={<Overview />} />
              <Route path="menu" element={<MenuManager />} />
              <Route path="offers" element={<Offers />} />
              <Route path="settings" element={<RestaurantSettings />} />
              <Route path="*" element={<Navigate to="/owner" replace />} />
            </Route>
          </Route>

          <Route element={<RequireRole role="rider" />}>
            <Route path="/rider" element={<RiderHub />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <footer className="footer">
        <div className="container">Dishpatch · a full stack portfolio project · map data © OpenStreetMap contributors</div>
      </footer>
    </>
  );
}
