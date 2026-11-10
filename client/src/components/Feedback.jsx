import { STATUS_LABEL } from '../utils/format';

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="center-box" role="status">
    <div className="spinner" />
    <span className="muted">{label}</span>
  </div>
);

export const ErrorBox = ({ error, onRetry }) => (
  <div className="alert alert-error" role="alert">
    <span>{error?.message || 'Something went wrong.'}</span>
    {onRetry && (
      <button className="btn btn-outline btn-sm" onClick={onRetry}>
        Retry
      </button>
    )}
  </div>
);

export const Empty = ({ icon = '🍽️', title, children }) => (
  <div className="center-box empty">
    <div className="empty-icon" aria-hidden="true">{icon}</div>
    <h3>{title}</h3>
    {children}
  </div>
);

export const StatusBadge = ({ status }) => <span className={`status status-${status}`}>{STATUS_LABEL[status] || status}</span>;

/** Green (veg) or red (non-veg) square, as on Indian food packaging. */
export const VegMark = ({ veg }) => (
  <span className={`veg-mark ${veg ? 'veg' : 'nonveg'}`} role="img" aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}>
    <span />
  </span>
);

export const Rating = ({ value, count }) =>
  count === 0 ? (
    <span className="rating rating-new">New</span>
  ) : (
    <span className="rating" title={`${value} out of 5${count ? ` from ${count} reviews` : ''}`}>
      ★ {Number(value).toFixed(1)}
      {count ? <span className="rating-count"> ({count})</span> : null}
    </span>
  );

export const Stars = ({ value, onChange, size = 28 }) => (
  <div className="stars" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        className={`star ${n <= value ? 'on' : ''}`}
        style={{ fontSize: size }}
        onClick={onChange ? () => onChange(n) : undefined}
        disabled={!onChange}
        role={onChange ? 'radio' : undefined}
        aria-checked={onChange ? n === value : undefined}
        aria-label={`${n} star${n > 1 ? 's' : ''}`}
      >
        ★
      </button>
    ))}
  </div>
);
