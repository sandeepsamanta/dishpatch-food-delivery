import { useRef } from 'react';
import { api } from '../../api/client';
import { Empty, ErrorBox, Spinner, VegMark } from '../../components/Feedback';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../hooks/useApi';
import { useSocketEvents } from '../../hooks/useSocket';
import { formatPrice, timeAgo } from '../../utils/format';

const COLUMNS = [
  { title: 'New', statuses: ['placed'], hint: 'Accept to start cooking' },
  { title: 'In the kitchen', statuses: ['accepted', 'preparing'], hint: '' },
  { title: 'Ready for pickup', statuses: ['ready'], hint: 'Waiting for the delivery partner' },
  { title: 'Out for delivery', statuses: ['picked_up'], hint: '' },
];

const ACTIONS = {
  placed: [{ to: 'accepted', label: 'Accept', primary: true }, { to: 'rejected', label: 'Decline' }],
  accepted: [{ to: 'preparing', label: 'Start preparing', primary: true }],
  preparing: [{ to: 'ready', label: 'Mark ready', primary: true }],
};

// A short two-tone chime when a new order arrives, so a busy kitchen notices it. Silently skipped if audio is blocked.
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.3);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch {
    /* no audio */
  }
}

function OrderCard({ order, onMove, busy }) {
  const actions = ACTIONS[order.status] || [];
  return (
    <article className={`kcard ${order.status === 'placed' ? 'new' : ''}`}>
      <header>
        <strong>#{order._id.slice(-6).toUpperCase()}</strong>
        <span className="muted small">{timeAgo(order.createdAt)}</span>
      </header>
      <ul>
        {order.items.map((l, i) => (
          <li key={i}>
            <VegMark veg={l.veg} />
            <span>
              <strong>{l.qty} ×</strong> {l.name}
              {l.options.length > 0 && <span className="muted tiny"> ({l.options.map((o) => o.name).join(', ')})</span>}
            </span>
          </li>
        ))}
      </ul>
      {order.note && <p className="note">“{order.note}”</p>}
      <div className="kmeta">
        <span>{formatPrice(order.total)} · COD</span>
        <span className="muted small">{order.deliveryAddress.name}</span>
      </div>
      {order.rider && <p className="small">🛵 {order.rider.name} {order.status === 'ready' ? 'is picking this up' : 'assigned'}</p>}
      {actions.length > 0 && (
        <div className="kactions">
          {actions.map((a) => (
            <button key={a.to} className={`btn btn-sm ${a.primary ? 'btn-primary' : 'btn-outline'}`} disabled={busy} onClick={() => onMove(order, a.to)}>{a.label}</button>
          ))}
        </div>
      )}
    </article>
  );
}

export default function LiveOrders() {
  const toast = useToast();
  const active = useApi('/owner/orders', { active: 'true' });
  const recent = useApi('/owner/orders', { status: 'delivered', limit: 8 });
  const moving = useRef(false);

  const refresh = () => {
    active.reload();
    recent.reload();
  };

  useSocketEvents({
    'order:new': () => {
      chime();
      toast.success('🔔 New order received!');
      refresh();
    },
    'order:update': refresh,
  });

  const move = async (order, status) => {
    if (moving.current) return;
    moving.current = true;
    try {
      await api.put(`/owner/orders/${order._id}/status`, { status });
      refresh();
    } catch (err) {
      toast.error(err.message);
      refresh();
    } finally {
      moving.current = false;
    }
  };

  if (active.error) return <ErrorBox error={active.error} onRetry={active.reload} />;
  if (active.loading && !active.data) return <Spinner />;
  const orders = active.data.orders;

  return (
    <>
      <p className="muted small live-dot"><span className="pulse" /> Live: new orders appear here and play a chime the moment they arrive.</p>
      {orders.length === 0 ? (
        <Empty icon="🍳" title="No active orders">
          <p className="muted">New orders show up here instantly. Make sure you are marked open.</p>
        </Empty>
      ) : (
        <div className="board">
          {COLUMNS.map((col) => {
            const items = orders.filter((o) => col.statuses.includes(o.status));
            return (
              <section key={col.title} className="board-col">
                <h3>{col.title} <span className="count">{items.length}</span></h3>
                {col.hint && items.length > 0 && <p className="muted tiny">{col.hint}</p>}
                {items.map((o) => <OrderCard key={o._id} order={o} onMove={move} busy={false} />)}
              </section>
            );
          })}
        </div>
      )}

      {recent.data?.orders.length > 0 && (
        <section className="card recent">
          <h3>Recently delivered</h3>
          <ul>
            {recent.data.orders.map((o) => (
              <li key={o._id}>
                <span>#{o._id.slice(-6).toUpperCase()} · {o.items.map((l) => `${l.qty}× ${l.name}`).join(', ')}</span>
                <strong>{formatPrice(o.total)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
