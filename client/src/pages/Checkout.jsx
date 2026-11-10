import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Empty, VegMark } from '../components/Feedback';
import FormField, { fieldErrors } from '../components/FormField';
import { MapPicker } from '../components/Maps';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { toOrderItems, unitPrice } from '../context/cartReducer';
import { useDeliveryLocation } from '../context/LocationContext';
import { useToast } from '../context/ToastContext';
import { couponText, formatPrice } from '../utils/format';

export default function Checkout() {
  const { user } = useAuth();
  const { cart, setQty, clear } = useCart();
  const { location } = useDeliveryLocation();
  const toast = useToast();
  const navigate = useNavigate();
  const placed = useRef(false); // stops the "empty cart" screen flashing after a successful order

  const [pin, setPin] = useState({ lat: location.lat, lng: location.lng });
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', line: '', city: 'Kolkata', pincode: '', note: '' });
  const [errors, setErrors] = useState({});
  const [couponInput, setCouponInput] = useState('');
  const [applied, setApplied] = useState('');
  const [couponError, setCouponError] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [offers, setOffers] = useState([]);
  const [busy, setBusy] = useState(false);

  const restaurantId = cart.restaurant?._id;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!restaurantId) return;
    api.get(`/restaurants/${restaurantId}`).then((d) => setOffers(d.coupons)).catch(() => {});
  }, [restaurantId]);

  // Ask the server for the real totals whenever the cart, the pin or the coupon changes.
  const itemsKey = JSON.stringify(toOrderItems(cart));
  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    const body = { restaurant: restaurantId, items: JSON.parse(itemsKey), location: pin };
    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/orders/quote', { ...body, couponCode: applied || undefined });
        if (cancelled) return;
        setQuote(res.quote);
        setQuoteError('');
        if (applied) setCouponError('');
      } catch (err) {
        if (cancelled) return;
        if (applied) {
          // Is the coupon the problem, or the order itself? Re-quote without it to find out.
          try {
            const res = await api.post('/orders/quote', body);
            if (cancelled) return;
            setQuote(res.quote);
            setQuoteError('');
            setCouponError(err.message);
            setApplied('');
            return;
          } catch (err2) {
            if (cancelled) return;
            setQuote(null);
            setQuoteError(err2.message);
            return;
          }
        }
        setQuote(null);
        setQuoteError(err.message);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [restaurantId, itemsKey, pin.lat, pin.lng, applied]);

  if (!restaurantId || cart.lines.length === 0) {
    if (placed.current) return null;
    return (
      <div className="container page">
        <Empty icon="🛒" title="Your cart is empty">
          <p className="muted">Pick a restaurant and add a few dishes.</p>
          <Link className="btn btn-primary" to="/">Browse restaurants</Link>
        </Empty>
      </div>
    );
  }

  const applyCoupon = (code) => {
    setCouponError('');
    setCouponInput(code);
    setApplied(code.trim().toUpperCase());
  };

  const place = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const { note, ...address } = form;
      const { order } = await api.post('/orders', {
        restaurant: restaurantId,
        items: toOrderItems(cart),
        couponCode: applied || undefined,
        location: pin,
        address,
        note: note || undefined,
      });
      placed.current = true;
      clear();
      toast.success('Order placed! The restaurant has been notified.');
      navigate(`/orders/${order._id}`, { replace: true });
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      toast.error(Object.keys(fe).length ? 'Please fix the highlighted fields.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page">
      <h1>Checkout</h1>
      <p className="muted">Ordering from <Link to={`/restaurants/${restaurantId}`}><strong>{cart.restaurant.name}</strong></Link></p>

      <form className="checkout-layout" onSubmit={place} noValidate>
        <div>
          <section className="card">
            <h2>Delivery details</h2>
            <div className="form-grid">
              <FormField label="Full name" error={errors.name}><input value={form.name} onChange={set('name')} autoComplete="name" /></FormField>
              <FormField label="Phone" error={errors.phone}><input value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+91 98765 43210" /></FormField>
              <FormField label="Address" error={errors.line}><input value={form.line} onChange={set('line')} autoComplete="street-address" placeholder="Flat, building, street" /></FormField>
              <FormField label="City" error={errors.city}><input value={form.city} onChange={set('city')} autoComplete="address-level2" /></FormField>
              <FormField label="Pincode" error={errors.pincode}><input value={form.pincode} onChange={set('pincode')} autoComplete="postal-code" inputMode="numeric" maxLength={6} /></FormField>
              <FormField label="Note for the restaurant (optional)"><input value={form.note} onChange={set('note')} maxLength={200} placeholder="Less spicy, no onion…" /></FormField>
            </div>
            <h3>Drop the pin where the rider should come</h3>
            <p className="muted small">Delivery fee and ETA depend on this pin. Click the map or drag the pin.</p>
            <MapPicker value={pin} onChange={setPin} height={260} />
          </section>

          <section className="card">
            <h2>Payment</h2>
            <label className="pay-option"><input type="radio" checked readOnly /> <span>💵 Cash on delivery</span></label>
            <p className="muted small">Pay the delivery partner when your food arrives.</p>
          </section>
        </div>

        <aside className="card summary">
          <h2>Your order</h2>
          <ul className="cart-lines">
            {cart.lines.map((l) => (
              <li key={l.key}>
                <div className="cart-line-name">
                  <VegMark veg={l.veg} />
                  <div>
                    <strong>{l.name}</strong>
                    {l.options.length > 0 && <div className="muted tiny">{l.options.map((o) => o.name).join(', ')}</div>}
                  </div>
                </div>
                <div className="qty qty-sm">
                  <button type="button" onClick={() => setQty(l.key, l.qty - 1)} aria-label={`Remove one ${l.name}`}>−</button>
                  <span>{l.qty}</span>
                  <button type="button" onClick={() => setQty(l.key, l.qty + 1)} aria-label={`Add one ${l.name}`}>+</button>
                </div>
                <span className="cart-line-price">{formatPrice(unitPrice(l) * l.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="coupon-box">
            <div className="coupon-row">
              <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" maxLength={20} />
              {applied ? (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setApplied(''); setCouponInput(''); setCouponError(''); }}>Remove</button>
              ) : (
                <button type="button" className="btn btn-outline btn-sm" disabled={!couponInput.trim()} onClick={() => applyCoupon(couponInput)}>Apply</button>
              )}
            </div>
            {couponError && <p className="field-error" role="alert">{couponError}</p>}
            {applied && quote?.couponCode && <p className="coupon-ok">✓ {quote.couponCode} applied</p>}
            {!applied && offers.length > 0 && (
              <div className="chips chips-sm">
                {offers.map((c) => <button type="button" key={c.code} className="chip" title={couponText(c)} onClick={() => applyCoupon(c.code)}>{c.code}</button>)}
              </div>
            )}
          </div>

          {quoteError ? (
            <div className="alert alert-error" role="alert">{quoteError}</div>
          ) : quote ? (
            <dl className="totals">
              <div><dt>Subtotal</dt><dd>{formatPrice(quote.subtotal)}</dd></div>
              {quote.discount > 0 && <div className="discount"><dt>Discount ({quote.couponCode})</dt><dd>− {formatPrice(quote.discount)}</dd></div>}
              <div><dt>Delivery ({quote.distanceKm} km)</dt><dd>{quote.deliveryFee === 0 ? <span className="free">FREE</span> : formatPrice(quote.deliveryFee)}</dd></div>
              <div><dt>GST (5%)</dt><dd>{formatPrice(quote.tax)}</dd></div>
              <div className="grand"><dt>Total</dt><dd>{formatPrice(quote.total)}</dd></div>
            </dl>
          ) : (
            <p className="muted">Calculating…</p>
          )}
          {quote && <p className="muted small">Estimated delivery in about <strong>{quote.etaMins} min</strong></p>}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy || !quote}>{busy ? 'Placing order…' : quote ? `Place order · ${formatPrice(quote.total)}` : 'Place order'}</button>
        </aside>
      </form>
    </div>
  );
}
