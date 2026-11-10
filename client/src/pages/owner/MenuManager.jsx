import { useState } from 'react';
import { api } from '../../api/client';
import { Empty, ErrorBox, Spinner, VegMark } from '../../components/Feedback';
import FormField, { fieldErrors } from '../../components/FormField';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../hooks/useApi';
import { formatPrice } from '../../utils/format';

const blank = { name: '', description: '', price: '', category: '', veg: true, image: '', available: true, popular: false, optionGroups: [] };
const blankGroup = () => ({ name: '', min: 0, max: 1, options: [{ name: '', price: 0 }] });

/** Edit "Size: Regular / Large (+₹80)" style customisation groups. */
function OptionGroupsEditor({ groups, onChange }) {
  const patchGroup = (i, patch) => onChange(groups.map((g, gi) => (gi === i ? { ...g, ...patch } : g)));
  const patchOption = (gi, oi, patch) => patchGroup(gi, { options: groups[gi].options.map((o, k) => (k === oi ? { ...o, ...patch } : o)) });
  return (
    <div className="og-editor">
      <h4>Customisations (size, add-ons…)</h4>
      {groups.map((g, gi) => (
        <fieldset key={gi} className="og">
          <div className="og-head">
            <input placeholder="Group name, e.g. Size" value={g.name} onChange={(e) => patchGroup(gi, { name: e.target.value })} aria-label="Group name" />
            <label className="small">Min <input type="number" min="0" max="12" value={g.min} onChange={(e) => patchGroup(gi, { min: Number(e.target.value) })} /></label>
            <label className="small">Max <input type="number" min="1" max="12" value={g.max} onChange={(e) => patchGroup(gi, { max: Number(e.target.value) })} /></label>
            <button type="button" className="btn btn-ghost-dark btn-sm" onClick={() => onChange(groups.filter((_, k) => k !== gi))}>Remove group</button>
          </div>
          {g.options.map((o, oi) => (
            <div key={oi} className="og-opt">
              <input placeholder="Option, e.g. Large" value={o.name} onChange={(e) => patchOption(gi, oi, { name: e.target.value })} aria-label="Option name" />
              <input type="number" min="0" placeholder="+ ₹" value={o.price} onChange={(e) => patchOption(gi, oi, { price: Number(e.target.value) })} aria-label="Extra price" />
              <button type="button" className="btn btn-ghost-dark btn-sm" disabled={g.options.length === 1} onClick={() => patchGroup(gi, { options: g.options.filter((_, k) => k !== oi) })} aria-label="Remove option">✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => patchGroup(gi, { options: [...g.options, { name: '', price: 0 }] })}>+ Add option</button>
          <p className="muted tiny">Min 1 / Max 1 = customer must pick one (like Size). Min 0 / Max 3 = up to three optional extras.</p>
        </fieldset>
      ))}
      <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([...groups, blankGroup()])}>+ Add customisation group</button>
    </div>
  );
}

function DishForm({ dish, categories, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(dish ? { ...blank, ...dish, price: String(dish.price) } : blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const check = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const body = {
        name: form.name, description: form.description, price: Number(form.price), category: form.category, veg: form.veg,
        image: form.image, available: form.available, popular: form.popular, optionGroups: form.optionGroups,
      };
      await (dish ? api.put(`/owner/menu/${dish._id}`, body) : api.post('/owner/menu', body));
      toast.success(dish ? 'Dish updated' : 'Dish added');
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
      <form className="modal" onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label={dish ? 'Edit dish' : 'Add dish'}>
        <h2>{dish ? 'Edit dish' : 'Add a dish'}</h2>
        <div className="form-grid">
          <FormField label="Name" error={errors.name}><input value={form.name} onChange={set('name')} maxLength={80} /></FormField>
          <FormField label="Price (₹)" error={errors.price}><input type="number" min="0" step="0.5" value={form.price} onChange={set('price')} /></FormField>
          <FormField label="Category" error={errors.category}>
            <input list="menu-cats" value={form.category} onChange={set('category')} placeholder="Starters, Mains…" />
            <datalist id="menu-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </FormField>
          <FormField label="Photo URL (optional)" error={errors.image}><input type="url" value={form.image} onChange={set('image')} placeholder="https://…" /></FormField>
          <FormField label="Description" error={errors.description}><textarea rows={2} value={form.description} onChange={set('description')} maxLength={300} /></FormField>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={form.veg} onChange={check('veg')} /> Vegetarian</label>
            <label className="check"><input type="checkbox" checked={form.available} onChange={check('available')} /> Available</label>
            <label className="check"><input type="checkbox" checked={form.popular} onChange={check('popular')} /> Mark as bestseller</label>
          </div>
        </div>
        <OptionGroupsEditor groups={form.optionGroups} onChange={(optionGroups) => setForm((f) => ({ ...f, optionGroups }))} />
        {errors.max && <p className="field-error">{errors.max}</p>}
        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" className="btn btn-ghost-dark" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save dish'}</button>
        </div>
      </form>
    </div>
  );
}

export default function MenuManager() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/owner/menu');
  const [editing, setEditing] = useState(null); // null | 'new' | dish

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;

  const items = data.items;
  const categories = [...new Set(items.map((i) => i.category))];

  const toggle = async (d) => {
    try {
      await api.put(`/owner/menu/${d._id}`, { available: !d.available });
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async (d) => {
    if (!window.confirm(`Delete "${d.name}"? Past orders keep their record.`)) return;
    try {
      await api.del(`/owner/menu/${d._id}`);
      toast.success('Dish deleted');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="toolbar">
        <h2>Menu ({items.length} dishes)</h2>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add dish</button>
      </div>
      {items.length === 0 ? (
        <Empty icon="📋" title="Your menu is empty"><p className="muted">Add your first dish so customers can order.</p></Empty>
      ) : (
        categories.map((cat) => (
          <section key={cat} className="card menu-cat">
            <h3>{cat}</h3>
            <table className="table">
              <tbody>
                {items.filter((i) => i.category === cat).map((d) => (
                  <tr key={d._id} className={d.available ? '' : 'off'}>
                    <td><VegMark veg={d.veg} /></td>
                    <td>
                      <strong>{d.name}</strong> {d.popular && <span className="tag-popular">Bestseller</span>}
                      {d.optionGroups.length > 0 && <div className="muted tiny">{d.optionGroups.map((g) => g.name).join(' · ')}</div>}
                    </td>
                    <td>{formatPrice(d.price)}</td>
                    <td>
                      <button className={`switch sm ${d.available ? 'on' : ''}`} role="switch" aria-checked={d.available} onClick={() => toggle(d)}>
                        <span className="knob" />{d.available ? 'Available' : 'Sold out'}
                      </button>
                    </td>
                    <td className="actions">
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing(d)}>Edit</button>
                      <button className="btn btn-ghost-dark btn-sm" onClick={() => remove(d)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
      {editing && <DishForm dish={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
