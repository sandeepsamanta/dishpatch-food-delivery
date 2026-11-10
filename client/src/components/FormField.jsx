export default function FormField({ label, error, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="muted small">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/** Turns the API's { details: [{field, message}] } into { field: message }. */
export const fieldErrors = (err) =>
  Object.fromEntries((err?.details || []).map((d) => [d.field.split('.').pop(), d.message]));
