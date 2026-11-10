import { Link } from 'react-router-dom';
import { Empty, ErrorBox, Spinner, StatusBadge } from '../components/Feedback';
import { useApi } from '../hooks/useApi';
import { useSocketEvents } from '../hooks/useSocket';
import { formatDateTime, formatPrice } from '../utils/format';

export default function MyOrders() {
  const { data, loading, error, reload } = useApi('/orders/mine');
  useSocketEvents({ 'order:update': () => reload() });

  if (error) return <div className="container page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading && !data) return <Spinner />;

  return (
    <div className="container page narrow-page">
      <h1>My orders</h1>
      {data.orders.length === 0 ? (
        <Empty icon="🧾" title="No orders yet">
          <p className="muted">When you order, it shows up here with live tracking.</p>
          <Link className="btn btn-primary" to="/">Find something to eat</Link>
        </Empty>
      ) : (
        <div className="order-list">
          {data.orders.map((o) => (
            <Link key={o._id} to={`/orders/${o._id}`} className="card order-row">
              <div>
                <strong>{o.restaurantName}</strong>
                <div className="muted small">{o.items.map((l) => `${l.qty} × ${l.name}`).join(', ')}</div>
                <div className="muted tiny">{formatDateTime(o.createdAt)} · #{o._id.slice(-6).toUpperCase()}</div>
              </div>
              <div className="order-row-right">
                <StatusBadge status={o.status} />
                <strong>{formatPrice(o.total)}</strong>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
