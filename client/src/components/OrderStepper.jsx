import { STATUS_LABEL, STEPS, formatDateTime } from '../utils/format';

/** Progress tracker for the happy path. Cancelled/rejected orders show a banner instead. */
export default function OrderStepper({ status, history = [] }) {
  if (status === 'cancelled' || status === 'rejected') {
    return <div className="alert alert-error">{status === 'rejected' ? 'The restaurant could not take this order.' : 'This order was cancelled.'}</div>;
  }
  const current = STEPS.indexOf(status);
  const at = (s) => history.find((h) => h.status === s)?.at;
  return (
    <ol className="stepper" aria-label="Order progress">
      {STEPS.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="dot">{i < current ? '✓' : i + 1}</span>
          <span className="step-label">{STATUS_LABEL[s]}</span>
          {at(s) && <span className="muted small">{formatDateTime(at(s))}</span>}
        </li>
      ))}
    </ol>
  );
}
