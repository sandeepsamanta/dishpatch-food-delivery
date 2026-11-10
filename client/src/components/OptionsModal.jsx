import { useEffect, useMemo, useState } from 'react';
import { MAX_QTY } from '../context/cartReducer';
import { formatPrice } from '../utils/format';
import { VegMark } from './Feedback';

/** Customise a dish (size, add-ons...) before adding it to the cart. */
export default function OptionsModal({ dish, onAdd, onClose }) {
  // Required single-choice groups start with their first option selected.
  const initial = useMemo(() => {
    const sel = {};
    for (const g of dish.optionGroups) sel[g.name] = g.min === 1 && g.max === 1 ? [g.options[0].name] : [];
    return sel;
  }, [dish]);
  const [selected, setSelected] = useState(initial);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (group, name) =>
    setSelected((s) => {
      const cur = s[group.name];
      if (group.max === 1) return { ...s, [group.name]: [name] };
      if (cur.includes(name)) return { ...s, [group.name]: cur.filter((n) => n !== name) };
      if (cur.length >= group.max) return s;
      return { ...s, [group.name]: [...cur, name] };
    });

  const chosen = dish.optionGroups.flatMap((g) =>
    selected[g.name].map((name) => ({ group: g.name, name, price: g.options.find((o) => o.name === name).price }))
  );
  const unit = dish.price + chosen.reduce((s, o) => s + o.price, 0);
  const missing = dish.optionGroups.find((g) => selected[g.name].length < g.min);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label={`Customise ${dish.name}`}>
        <div className="modal-head">
          <VegMark veg={dish.veg} />
          <div>
            <h2>{dish.name}</h2>
            <p className="muted small">{formatPrice(dish.price)}</p>
          </div>
        </div>

        {dish.optionGroups.map((g) => (
          <fieldset key={g.name} className="opt-group">
            <legend>
              {g.name}
              <span className="muted small">
                {' '}
                {g.min >= 1 ? 'Required' : 'Optional'}
                {g.max > 1 ? ` · choose up to ${g.max}` : ''}
              </span>
            </legend>
            {g.options.map((o) => (
              <label key={o.name} className="opt-row">
                <input
                  type={g.max === 1 ? 'radio' : 'checkbox'}
                  name={g.name}
                  checked={selected[g.name].includes(o.name)}
                  onChange={() => toggle(g, o.name)}
                  disabled={g.max > 1 && !selected[g.name].includes(o.name) && selected[g.name].length >= g.max}
                />
                <span className="opt-name">{o.name}</span>
                <span className="muted">{o.price ? `+ ${formatPrice(o.price)}` : ''}</span>
              </label>
            ))}
          </fieldset>
        ))}

        <div className="modal-actions">
          <div className="qty">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
            <span aria-live="polite">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} aria-label="Increase quantity">+</button>
          </div>
          <button className="btn btn-primary grow" disabled={Boolean(missing)} onClick={() => onAdd(chosen, qty)}>
            {missing ? `Choose ${missing.name}` : `Add to cart · ${formatPrice(unit * qty)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
