import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { Empty, ErrorBox, Spinner, StatusBadge } from '../../components/Feedback';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../hooks/useApi';
import { useSocketEvents } from '../../hooks/useSocket';
import { formatDateTime, formatPrice } from '../../utils/format';

const STEPS = 28; // simulated ride: 28 position updates, one every 2 seconds

/** Moves a dot from the restaurant to the customer and reports each position, like a real rider's phone would. */
function useRideSimulator(order, toast) {
  const [mode, setMode] = useState('idle'); // idle | sim | gps
  const timer = useRef(null);
  const watch = useRef(null);

  const stop = () => {
    clearInterval(timer.current);
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    timer.current = watch.current = null;
    setMode('idle');
  };
  useEffect(() => stop, []); // stop when leaving the page

  const send = (lat, lng) => api.put(`/rider/orders/${order._id}/location`, { lat, lng }).catch((e) => {
    stop();
    toast.error(e.message);
  });

  const simulate = () => {
    const from = order.restaurant.location;
    const to = order.deliveryAddress.location;
    let i = 0;
    setMode('sim');
    const tick = () => {
      i += 1;
      const t = Math.min(1, i / STEPS);
      // A slight sideways wobble so the route looks like streets rather than a ruler line.
      const wobble = Math.sin(t * Math.PI * 3) * 0.0012 * (1 - t);
      send(from.lat + (to.lat - from.lat) * t + wobble, from.lng + (to.lng - from.lng) * t - wobble);
      if (t >= 1) {
        clearInterval(timer.current);
        setMode('idle');
        toast.success('You have reached the delivery address. Mark the order as delivered.');
      }
    };
    tick();
    timer.current = setInterval(tick, 2000);
  };

  const useGps = () => {
    if (!navigator.geolocation) return toast.error('Location is not available on this device.');
    setMode('gps');
    watch.current = navigator.geolocation.watchPosition(
      (p) => send(p.coords.latitude, p.coords.longitude),
      () => {
        stop();
        toast.error('Could not read your location. Try the simulator instead.');
      },
      { enableHighAccuracy: true }
    );
  };

  return { mode, simulate, useGps, stop };
}

function ActiveDelivery({ order, onChange }) {
  const toast = useToast();
  const ride = useRideSimulator(order, toast);
  const [busy, setBusy] = useState(false);

  const move = async (status) => {
    setBusy(true);
    try {
      ride.stop();
      await api.put(`/rider/orders/${order._id}/status`, { status });
      toast.success(status === 'picked_up' ? 'Picked up. Safe riding!' : 'Delivered. Collect the cash from the customer.');
      onChange();
    } catch (err) {
      toast.error(err.message);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const a = order.deliveryAddress;
  return (
    <article className="card active-delivery">
      <div className="page-head"><h2>Current delivery · #{order._id.slice(-6).toUpperCase()}</h2><StatusBadge status={order.status} /></div>
      <div className="two-col">
        <div>
          <h4>1 · Pick up from</h4>
          <p><strong>{order.restaurant.name}</strong><br /><span className="muted small">{order.restaurant.address}</span></p>
          <p className="small">{order.items.map((l) => `${l.qty} × ${l.name}`).join(', ')}</p>
        </div>
        <div>
          <h4>2 · Deliver to</h4>
          <p><strong>{a.name}</strong><br /><span className="muted small">{a.line}, {a.city} {a.pincode}</span><br /><a href={`tel:${a.phone}`}>{a.phone}</a></p>
          <p className="small">Collect <strong>{formatPrice(order.total)}</strong> in cash · you earn <strong>{formatPrice(order.deliveryFee)}</strong></p>
        </div>
      </div>

      {order.status !== 'picked_up' ? (
        <>
          <button className="btn btn-primary" disabled={busy || order.status !== 'ready'} onClick={() => move('picked_up')}>
            {order.status === 'ready' ? 'I have picked up the order' : 'Waiting for the kitchen to mark it ready…'}
          </button>
          {order.status !== 'ready' && <p className="muted small">This screen updates by itself when the restaurant is done.</p>}
        </>
      ) : (
        <>
          <div className="ride-controls">
            {ride.mode === 'idle' ? (
              <>
                <button className="btn btn-outline" onClick={ride.simulate}>▶ Simulate the ride</button>
                <button className="btn btn-outline" onClick={ride.useGps}>📡 Share my real location</button>
              </>
            ) : (
              <button className="btn btn-outline" onClick={ride.stop}>■ Stop sharing ({ride.mode === 'sim' ? 'simulating' : 'GPS'})</button>
            )}
            <span className="muted small">The customer sees your position move live on their map.</span>
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={() => move('delivered')}>Mark as delivered</button>
        </>
      )}
    </article>
  );
}

export default function RiderHub() {
  const toast = useToast();
  const available = useApi('/rider/orders/available');
  const mine = useApi('/rider/orders/mine');
  const [claiming, setClaiming] = useState(false);

  const refresh = () => {
    available.reload();
    mine.reload();
  };
  useSocketEvents({
    'order:available': () => {
      toast.success('🛵 New order available nearby');
      available.reload();
    },
    'order:unavailable': available.reload,
    'order:update': refresh,
  });

  const claim = async (o) => {
    setClaiming(true);
    try {
      await api.post(`/rider/orders/${o._id}/claim`);
      toast.success('Order accepted. Head to the restaurant.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClaiming(false);
      refresh();
    }
  };

  if (mine.error) return <div className="container page"><ErrorBox error={mine.error} onRetry={refresh} /></div>;
  if ((mine.loading && !mine.data) || (available.loading && !available.data)) return <Spinner />;
  const { active, history, earnings } = mine.data;
  const offers = available.data?.orders || [];

  return (
    <div className="container page">
      <h1>Deliveries</h1>
      <div className="stat-grid">
        <div className="stat"><span className="muted small">Deliveries completed</span><strong>{earnings.deliveries}</strong></div>
        <div className="stat"><span className="muted small">Total earned</span><strong>{formatPrice(earnings.total)}</strong></div>
        <div className="stat"><span className="muted small">Distance covered</span><strong>{earnings.km} km</strong></div>
      </div>

      {active.map((o) => <ActiveDelivery key={o._id} order={o} onChange={refresh} />)}

      <section>
        <h2>Orders waiting for a rider <span className="count">{offers.length}</span></h2>
        <p className="muted small live-dot"><span className="pulse" /> Live: new orders appear the moment a restaurant accepts them.</p>
        {active.length > 0 && offers.length > 0 && <p className="muted small">Finish your current delivery to accept another.</p>}
        {offers.length === 0 ? (
          <Empty icon="🛵" title="No orders waiting"><p className="muted">Stay on this screen. We will ping you when one comes in.</p></Empty>
        ) : (
          <div className="grid offer-grid">
            {offers.map((o) => (
              <article key={o._id} className="card">
                <strong>{o.restaurant.name}</strong>
                <p className="muted small">{o.restaurant.address}</p>
                <p className="small">→ {o.deliveryAddress.line}, {o.deliveryAddress.city}</p>
                <div className="kmeta"><span>{o.distanceKm} km</span><strong>Earn {formatPrice(o.deliveryFee)}</strong></div>
                <p className="muted tiny">{o.status === 'ready' ? 'Food is ready now' : 'Being prepared'}</p>
                <button className="btn btn-primary btn-block" disabled={claiming || active.length > 0} onClick={() => claim(o)}>Accept delivery</button>
              </article>
            ))}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="card recent">
          <h3>Completed deliveries</h3>
          <ul>
            {history.map((o) => (
              <li key={o._id}><span>{o.restaurant.name} → {o.deliveryAddress.name} · {formatDateTime(o.deliveredAt)}</span><strong>+ {formatPrice(o.deliveryFee)}</strong></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
