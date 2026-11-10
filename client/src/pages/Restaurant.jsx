import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Empty, ErrorBox, Rating, Spinner, Stars, VegMark } from '../components/Feedback';
import OptionsModal from '../components/OptionsModal';
import { placeholderBg } from '../components/RestaurantCard';
import { useCart } from '../context/CartContext';
import { unitPrice } from '../context/cartReducer';
import { useDeliveryLocation } from '../context/LocationContext';
import { useToast } from '../context/ToastContext';
import { useApi } from '../hooks/useApi';
import { couponText, formatPrice, timeAgo } from '../utils/format';

function DishCard({ dish, disabled, onAdd }) {
  const unavailable = !dish.available || disabled;
  const hasOptions = dish.optionGroups?.length > 0;
  return (
    <article className={`dish ${unavailable ? 'unavailable' : ''}`}>
      <div className="dish-info">
        <div className="dish-title">
          <VegMark veg={dish.veg} />
          <h3>{dish.name}</h3>
          {dish.popular && <span className="tag-popular">Bestseller</span>}
        </div>
        <p className="dish-price">{formatPrice(dish.price)}</p>
        {dish.description && <p className="muted small dish-desc">{dish.description}</p>}
      </div>
      <div className="dish-side">
        {dish.image ? <img src={dish.image} alt={dish.name} loading="lazy" className="dish-img" /> : <div className="dish-img dish-img-empty" style={{ background: placeholderBg(dish.name) }} aria-hidden="true" />}
        <button className="btn btn-add" disabled={unavailable} onClick={() => onAdd(dish)}>
          {!dish.available ? 'Sold out' : hasOptions ? 'Add +' : 'Add'}
        </button>
        {hasOptions && dish.available && <span className="muted tiny">Customisable</span>}
      </div>
    </article>
  );
}

function CartSummary({ restaurant, cart, setQty, subtotal }) {
  const mine = cart.restaurant?._id === restaurant._id;
  if (!mine) {
    return cart.lines.length ? (
      <aside className="cart-panel">
        <h3>Your cart</h3>
        <p className="muted small">It has items from <strong>{cart.restaurant.name}</strong>. Adding a dish here will ask to start a new cart.</p>
        <Link className="btn btn-outline btn-block" to={`/restaurants/${cart.restaurant._id}`}>Back to {cart.restaurant.name}</Link>
      </aside>
    ) : (
      <aside className="cart-panel"><h3>Your cart</h3><p className="muted small">Your cart is empty. Add something tasty.</p></aside>
    );
  }
  return (
    <aside className="cart-panel">
      <h3>Your cart</h3>
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
              <button onClick={() => setQty(l.key, l.qty - 1)} aria-label={`Remove one ${l.name}`}>−</button>
              <span>{l.qty}</span>
              <button onClick={() => setQty(l.key, l.qty + 1)} aria-label={`Add one ${l.name}`}>+</button>
            </div>
            <span className="cart-line-price">{formatPrice(unitPrice(l) * l.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="row"><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
      <p className="muted tiny">Delivery fee, taxes and coupons are calculated at checkout.</p>
      <Link className="btn btn-primary btn-block" to="/checkout">Go to checkout</Link>
    </aside>
  );
}

export default function Restaurant() {
  const { id } = useParams();
  const { location } = useDeliveryLocation();
  const { cart, add, replaceWith, setQty, subtotal } = useCart();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(`/restaurants/${id}`, { lat: location.lat, lng: location.lng });
  const [vegOnly, setVegOnly] = useState(false);
  const [customising, setCustomising] = useState(null);

  const sections = useMemo(() => {
    const groups = new Map();
    for (const d of data?.menu || []) {
      if (vegOnly && !d.veg) continue;
      if (!groups.has(d.category)) groups.set(d.category, []);
      groups.get(d.category).push(d);
    }
    // Bestsellers first within each category already (server sort); put categories with a bestseller up top.
    return [...groups.entries()].sort((a, b) => Number(b[1].some((d) => d.popular)) - Number(a[1].some((d) => d.popular)));
  }, [data, vegOnly]);

  if (error) return <div className="container page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading && !data) return <Spinner />;
  const { restaurant: r, coupons, reviews } = data;

  const addToCart = (dish, options = [], qty = 1) => {
    const shop = { _id: r._id, name: r.name };
    const item = { _id: dish._id, name: dish.name, price: dish.price, veg: dish.veg };
    if (cart.restaurant && cart.restaurant._id !== r._id && cart.lines.length) {
      if (!window.confirm(`Your cart has items from ${cart.restaurant.name}. Start a new cart with ${r.name}?`)) return;
      replaceWith(shop, item, options, qty);
    } else add(shop, item, options, qty);
    toast.success(`${dish.name} added to cart`);
    setCustomising(null);
  };

  const onAdd = (dish) => (dish.optionGroups?.length ? setCustomising(dish) : addToCart(dish));

  return (
    <div className="container page">
      <header className="rest-hero">
        <div className="rest-hero-img" style={r.image ? undefined : { background: placeholderBg(r.name) }}>
          {r.image && <img src={r.image} alt="" />}
        </div>
        <div className="rest-hero-info">
          <h1>{r.name}</h1>
          <p className="muted">{r.cuisines.join(' · ')}</p>
          <p className="small">{r.address}</p>
          <div className="rest-hero-meta">
            <Rating value={r.ratingAvg} count={r.ratingCount} />
            <span>⏱ {r.etaMins ? `${r.etaMins} min` : `~${r.prepTime + 15} min`}</span>
            {typeof r.distanceKm === 'number' && <span>📍 {r.distanceKm} km away</span>}
            <span>₹{r.priceForTwo} for two</span>
            {r.minOrder > 0 && <span>Min order ₹{r.minOrder}</span>}
          </div>
          {!r.isOpen && <div className="alert alert-error">This restaurant is closed right now. You can browse the menu, but ordering is paused.</div>}
          {r.deliverable === false && <div className="alert alert-error">This restaurant does not deliver to your current location ({r.distanceKm} km away, max {r.deliveryRadiusKm} km).</div>}
        </div>
      </header>

      {coupons.length > 0 && (
        <div className="offers" aria-label="Offers">
          {coupons.map((c) => (
            <div key={c.code} className="offer">
              <strong>{couponText(c)}</strong>
              <span className="muted small">Use code <b>{c.code}</b>{c.minOrder ? ` · min ₹${c.minOrder}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rest-layout">
        <main>
          <div className="toolbar">
            <label className="check"><input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} /> Veg only</label>
            <span className="spacer" />
            <nav className="muted small cat-nav" aria-label="Menu sections">
              {sections.map(([cat]) => <a key={cat} href={`#cat-${cat.replace(/\W+/g, '-')}`}>{cat}</a>)}
            </nav>
          </div>
          {sections.length === 0 ? (
            <Empty icon="🥗" title="No dishes to show" />
          ) : (
            sections.map(([cat, dishes]) => (
              <section key={cat} id={`cat-${cat.replace(/\W+/g, '-')}`} className="menu-section">
                <h2>{cat} <span className="muted small">({dishes.length})</span></h2>
                {dishes.map((d) => <DishCard key={d._id} dish={d} disabled={!r.isOpen} onAdd={onAdd} />)}
              </section>
            ))
          )}

          <section className="menu-section" id="reviews">
            <h2>Reviews</h2>
            {reviews.length === 0 ? (
              <p className="muted">No reviews yet. Customers can rate this restaurant after their order is delivered.</p>
            ) : (
              reviews.map((rv) => (
                <article key={rv._id} className="review">
                  <div className="review-head">
                    <strong>{rv.userName}</strong>
                    <Stars value={rv.rating} size={16} />
                    <span className="muted small">{timeAgo(rv.createdAt)}</span>
                  </div>
                  {rv.comment && <p>{rv.comment}</p>}
                </article>
              ))
            )}
          </section>
        </main>
        <CartSummary restaurant={r} cart={cart} setQty={setQty} subtotal={subtotal} />
      </div>

      {customising && <OptionsModal dish={customising} onClose={() => setCustomising(null)} onAdd={(options, qty) => addToCart(customising, options, qty)} />}
    </div>
  );
}
