import { useState } from 'react';
import { api } from '../../api/client';
import { Empty, ErrorBox, Spinner } from '../../components/Feedback';
import FormField, { fieldErrors } from '../../components/FormField';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../hooks/useApi';
import { couponText, formatDate } from '../../utils/format';

const blank = { code: '', description: '', type: 'percent', value: '10', maxDiscount: '', minOrder: '', usageLimit: '', expiresAt: '' };

function CouponForm({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      await api.post('/owner/coupons', {
        code: form.code,
        description: form.description,
        type: form.type,
        value: form.type === 'free_delivery' ? 0 : Number(form.value),
        maxDiscount: Number(form.maxDiscount) || 0,
        minOrder: Number(form.minOrder) || 0,
        usageLimit: Number(form.usageLimit) || 0,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
      });
      toast.success('Offer created');
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-sm" onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label="New offer">
        <h2>New offer</h2>
        <div className="form-grid one">
          <FormField label="Code" error={errors.code} hint="Letters and digits, e.g. WELCOME20"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={20} /></FormField>
          <FormField label="Description" error={errors.description}><input value={form.description} onChange={set('description')} maxLength={140} placeholder="20% off your first order" /></FormField>
          <FormField label="Type" error={errors.type}>
            <select value={form.type} onChange={set('type')}>
              <option value="percent">Percentage off</option>
              <option value="flat">Flat amount off</option>
              <option value="free_delivery">Free delivery</option>
            </select>
          </FormField>
          {form.type !== 'free_delivery' && <FormField label={form.type === 'percent' ? 'Percent (1-100)' : 'Amount (₹)'} error={errors.value}><input type="number" min="1" value={form.value} onChange={set('value')} /></FormField>}
          {form.type === 'percent' && <FormField label="Maximum discount (₹, optional)" error={errors.maxDiscount}><input type="number" min="0" value={form.maxDiscount} onChange={set('maxDiscount')} /></FormField>}
          <FormField label="Minimum order (₹, optional)" error={errors.minOrder}><input type="number" min="0" value={form.minOrder} onChange={set('minOrder')} /></FormField>
          <FormField label="Total uses allowed (optional)" error={errors.usageLimit} hint="Each customer can use a code once"><input type="number" min="0" value={form.usageLimit} onChange={set('usageLimit')} /></FormField>
          <FormField label="Expires on (optional)" error={errors.expiresAt}><input type="date" value={form.expiresAt} onChange={set('expiresAt')} /></FormField>
        </div>
        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" className="btn btn-ghost-dark" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Create offer'}</button>
        </div>
      </form>
    </div>
  );
}

export default function Offers() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/owner/coupons');
  const [creating, setCreating] = useState(false);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;

  const patch = async (c, body) => {
    try {
      await api.put(`/owner/coupons/${c._id}`, body);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete offer ${c.code}?`)) return;
    try {
      await api.del(`/owner/coupons/${c._id}`);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="toolbar">
        <h2>Your offers</h2>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New offer</button>
      </div>
      <p className="muted small">Offers you create here apply only to your restaurant. Platform-wide codes (like WELCOME50) are also available to your customers.</p>
      {data.coupons.length === 0 ? (
        <Empty icon="🏷️" title="No offers yet"><p className="muted">Create a code to bring in more orders.</p></Empty>
      ) : (
        <div className="grid offer-grid">
          {data.coupons.map((c) => (
            <article key={c._id} className={`card offer-card ${c.active ? '' : 'off'}`}>
              <div className="offer-code">{c.code}</div>
              <strong>{couponText(c)}</strong>
              {c.description && <p className="muted small">{c.description}</p>}
              <ul className="muted small">
                {c.minOrder > 0 && <li>Minimum order ₹{c.minOrder}</li>}
                <li>Used {c.usedCount}{c.usageLimit ? ` of ${c.usageLimit}` : ''} times</li>
                {c.expiresAt && <li>Expires {formatDate(c.expiresAt)}</li>}
              </ul>
              <div className="offer-actions">
                <button className={`switch sm ${c.active ? 'on' : ''}`} role="switch" aria-checked={c.active} onClick={() => patch(c, { active: !c.active })}><span className="knob" />{c.active ? 'Active' : 'Paused'}</button>
                <button className="btn btn-ghost-dark btn-sm" onClick={() => remove(c)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {creating && <CouponForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </>
  );
}
