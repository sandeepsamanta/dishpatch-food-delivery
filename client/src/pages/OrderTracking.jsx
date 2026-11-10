import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ErrorBox, Spinner, StatusBadge, Stars, VegMark } from '../components/Feedback';
import { TrackMap } from '../components/Maps';
import OrderStepper from '../components/OrderStepper';
import { useToast } from '../context/ToastContext';
import { useApi } from '../hooks/useApi';
import { useSocketEvents } from '../hooks/useSocket';
import { formatDateTime, formatPrice } from '../utils/format';

function ReviewForm({ orderId, onDone }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return toast.error('Pick a star rating first.');
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/review`, { rating, comment: comment || undefined });
      toast.success('Thanks for your review!');
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h2>How was your order?</h2>
      <Stars value={rating} onChange={setRating} />
      <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Tell others what you liked (optional)" aria-label="Review comment" />
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit review'}</button>
    </form>
  );
}

export default function OrderTracking() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(`/orders/${id}`);
  const [live, setLive] = useState({}); // fields pushed by the server since the page loaded

  // Server-pushed updates for this order. No polling.
  useSocketEvents({
    'order:update': (p) => {
      if (p._id !== id) return;
      setLive((l) => ({ ...l, ...p }));
      // The push only carries the rider's id; reload once to fetch their name and phone.
      if (p.rider && !data?.order?.rider) reload();
    },
    'order:location': (p) => p._id === id && setLive((l) => ({ ...l, riderLocation: p.riderLocation })),
  });

  if (error) return <div className="container page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading && !data) return <Spinner />;
  const order = { ...data.order, ...live };
  const active = !['delivered', 'cancelled', 'rejected'].includes(order.status);
  const rider = data.order.rider; // name/phone come from the initial load; it is set when claimed

  const cancel = async () => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await api.put(`/orders/${id}/cancel`);
      setLive({});
      reload();
      toast.success('Order cancelled');
    } catch (err) {
      toast.error(err.message);
      reload();
    }
  };

  return (
    <div className="container page narrow-page">
      <div className="page-head">
        <div>
          <h1>Order #{id.slice(-6).toUpperCase()}</h1>
          <p className="muted">{data.order.restaurant.name} · placed {formatDateTime(data.order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {active && <p className="eta-banner">⏱ Arriving in about <strong>{order.etaMins} min</strong>. This page updates live.</p>}
      <section className="card"><OrderStepper status={order.status} history={order.statusHistory} /></section>

      {(order.status === 'picked_up' || order.status === 'ready' || active) && (
        <section className="card map-card">
          <TrackMap
            restaurant={{ ...data.order.restaurant.location, name: data.order.restaurant.name }}
            destination={data.order.deliveryAddress.location}
            rider={order.status === 'picked_up' ? order.riderLocation : null}
          />
          {order.status === 'picked_up' && !order.riderLocation && <p className="muted small">Your delivery partner is on the way. Their live position will appear here.</p>}
        </section>
      )}

      {rider && active && (
        <section className="card rider-card">
          <span className="rider-avatar" aria-hidden="true">🛵</span>
          <div>
            <strong>{rider.name}</strong> is your delivery partner
            {rider.phone && <div className="muted small">Call: <a href={`tel:${rider.phone}`}>{rider.phone}</a></div>}
          </div>
        </section>
      )}

      {order.status === 'delivered' && !order.reviewed && <ReviewForm orderId={id} onDone={reload} />}

      <section className="card">
        <h2>Order details</h2>
        <ul className="cart-lines static">
          {data.order.items.map((l, i) => (
            <li key={i}>
              <div className="cart-line-name">
                <VegMark veg={l.veg} />
                <div>
                  <strong>{l.qty} × {l.name}</strong>
                  {l.options.length > 0 && <div className="muted tiny">{l.options.map((o) => o.name).join(', ')}</div>}
                </div>
              </div>
              <span className="cart-line-price">{formatPrice(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="totals">
          <div><dt>Subtotal</dt><dd>{formatPrice(data.order.subtotal)}</dd></div>
          {data.order.discount > 0 && <div className="discount"><dt>Discount ({data.order.couponCode})</dt><dd>− {formatPrice(data.order.discount)}</dd></div>}
          <div><dt>Delivery</dt><dd>{data.order.deliveryFee === 0 ? <span className="free">FREE</span> : formatPrice(data.order.deliveryFee)}</dd></div>
          <div><dt>GST (5%)</dt><dd>{formatPrice(data.order.tax)}</dd></div>
          <div className="grand"><dt>Total ({order.paymentStatus === 'paid' ? 'paid' : 'pay on delivery'})</dt><dd>{formatPrice(data.order.total)}</dd></div>
        </dl>
        <p className="muted small">Deliver to: {data.order.deliveryAddress.name}, {data.order.deliveryAddress.line}, {data.order.deliveryAddress.city} {data.order.deliveryAddress.pincode}</p>
        {data.order.note && <p className="muted small">Note: {data.order.note}</p>}
        {order.status === 'placed' && <button className="btn btn-outline" onClick={cancel}>Cancel order</button>}
      </section>
      <p><Link to="/orders">← All orders</Link></p>
    </div>
  );
}
