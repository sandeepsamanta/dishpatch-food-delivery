import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, ErrorBox, Spinner } from '../components/Feedback';
import Pagination from '../components/Pagination';
import RestaurantCard from '../components/RestaurantCard';
import { useDeliveryLocation } from '../context/LocationContext';
import { useApi } from '../hooks/useApi';

export default function Home() {
  const [params, setParams] = useSearchParams();
  const { location, openPicker } = useDeliveryLocation();
  const q = params.get('q') || '';
  const cuisine = params.get('cuisine') || '';
  const pureVeg = params.get('pureVeg') === 'true';
  const sort = params.get('sort') || 'rating';
  const page = Number(params.get('page')) || 1;

  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries({ page: undefined, ...patch })) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };

  // Debounce typing so we don't query on every keystroke.
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => update({ q: search.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, loading, error, reload } = useApi('/restaurants', {
    q, cuisine, pureVeg: pureVeg || undefined, sort, page, limit: 12, lat: location.lat, lng: location.lng,
  });
  const { data: cuisineData } = useApi('/restaurants/cuisines');

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Hungry? Get it delivered, hot.</h1>
          <p>Order from restaurants near you and watch your food arrive on the map.</p>
          <form className="hero-search" onSubmit={(e) => e.preventDefault()} role="search">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search restaurants or cuisines (biryani, pizza, rolls…)" aria-label="Search restaurants" />
          </form>
          <button className="link-btn hero-loc" onClick={openPicker}>📍 Delivering to: <strong>{location.label}</strong> (change)</button>
        </div>
      </section>

      <div className="container page">
        <div className="chips" role="group" aria-label="Filter by cuisine">
          <button className={`chip ${!cuisine ? 'on' : ''}`} onClick={() => update({ cuisine: '' })}>All</button>
          {(cuisineData?.cuisines || []).map((c) => (
            <button key={c} className={`chip ${cuisine === c ? 'on' : ''}`} onClick={() => update({ cuisine: cuisine === c ? '' : c })}>{c}</button>
          ))}
        </div>

        <div className="toolbar">
          <label className="check">
            <input type="checkbox" checked={pureVeg} onChange={(e) => update({ pureVeg: e.target.checked ? 'true' : '' })} /> Pure veg only
          </label>
          <span className="spacer" />
          <label className="sort">
            Sort by{' '}
            <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="rating">Top rated</option>
              <option value="distance">Nearest</option>
              <option value="eta">Fastest kitchen</option>
              <option value="price">Price: low to high</option>
            </select>
          </label>
        </div>

        {error ? (
          <ErrorBox error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Spinner label="Finding restaurants near you…" />
        ) : data.restaurants.length === 0 ? (
          <Empty icon="🛵" title="No restaurants deliver here">
            <p className="muted">Try a different search, or move your delivery pin closer to the city centre.</p>
            <button className="btn btn-primary" onClick={openPicker}>Change location</button>
          </Empty>
        ) : (
          <>
            <p className="muted small">{data.total} restaurant{data.total === 1 ? '' : 's'} deliver to you</p>
            <div className={`grid rest-grid ${loading ? 'dim' : ''}`}>
              {data.restaurants.map((r) => <RestaurantCard key={r._id} r={r} />)}
            </div>
            <Pagination page={data.page} pages={data.pages} onChange={(p) => { update({ page: p > 1 ? String(p) : '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          </>
        )}
      </div>
    </>
  );
}
