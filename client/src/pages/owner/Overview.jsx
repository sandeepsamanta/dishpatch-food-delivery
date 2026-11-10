import { ErrorBox, Spinner } from '../../components/Feedback';
import { useApi } from '../../hooks/useApi';
import { useSocketEvents } from '../../hooks/useSocket';
import { formatPrice } from '../../utils/format';

const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });

export default function Overview() {
  const { data, loading, error, reload } = useApi('/owner/stats');
  useSocketEvents({ 'order:update': reload, 'order:new': reload });

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  const max = Math.max(1, ...data.last7.map((d) => d.revenue));

  return (
    <>
      <div className="stat-grid">
        <div className="stat"><span className="muted small">Orders today</span><strong>{data.today.orders}</strong></div>
        <div className="stat"><span className="muted small">Delivered revenue today</span><strong>{formatPrice(data.today.revenue)}</strong></div>
        <div className="stat"><span className="muted small">Waiting for you</span><strong>{data.pending}</strong></div>
        <div className="stat"><span className="muted small">In progress</span><strong>{data.active}</strong></div>
      </div>

      <div className="two-col">
        <section className="card">
          <h3>Revenue, last 7 days</h3>
          <div className="bars" role="img" aria-label="Revenue per day for the last 7 days">
            {data.last7.map((d) => (
              <div key={d.day} className="bar-col" title={`${d.day}: ${formatPrice(d.revenue)} from ${d.orders} orders`}>
                <span className="bar-val">{d.revenue ? formatPrice(d.revenue).replace('.00', '') : ''}</span>
                <div className="bar" style={{ height: `${Math.max(3, (d.revenue / max) * 100)}%` }} />
                <span className="muted tiny">{dayLabel(d.day)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Best sellers</h3>
          {data.topItems.length === 0 ? (
            <p className="muted">Delivered orders will rank your dishes here.</p>
          ) : (
            <ol className="top-items">
              {data.topItems.map((t) => (
                <li key={t.name}><span>{t.name}</span><span className="muted">{t.qty} sold · {formatPrice(t.revenue)}</span></li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
