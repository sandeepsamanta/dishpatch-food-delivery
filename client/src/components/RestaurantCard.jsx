import { Link } from 'react-router-dom';
import { Rating } from './Feedback';

const gradients = ['linear-gradient(135deg,#fb923c,#ea580c)', 'linear-gradient(135deg,#f472b6,#be185d)', 'linear-gradient(135deg,#facc15,#ca8a04)', 'linear-gradient(135deg,#34d399,#047857)', 'linear-gradient(135deg,#60a5fa,#1d4ed8)'];
export const placeholderBg = (name = '') => gradients[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % gradients.length];

export default function RestaurantCard({ r }) {
  return (
    <Link to={`/restaurants/${r._id}`} className={`rest-card ${r.isOpen ? '' : 'closed'}`}>
      <div className="rest-img" style={r.image ? undefined : { background: placeholderBg(r.name) }}>
        {r.image ? <img src={r.image} alt={r.name} loading="lazy" /> : <span className="rest-initial" aria-hidden="true">{r.name[0]}</span>}
        {!r.isOpen && <span className="closed-tag">Closed</span>}
        {r.pureVeg && <span className="veg-tag">Pure veg</span>}
      </div>
      <div className="rest-body">
        <div className="rest-top">
          <h3>{r.name}</h3>
          <Rating value={r.ratingAvg} count={r.ratingCount} />
        </div>
        <p className="muted small">{r.cuisines.join(' · ') || 'Restaurant'}</p>
        <div className="rest-meta">
          <span>{r.etaMins ? `${r.etaMins} min` : `~${r.prepTime + 15} min`}</span>
          {typeof r.distanceKm === 'number' && <span>{r.distanceKm} km</span>}
          <span>₹{r.priceForTwo} for two</span>
        </div>
      </div>
    </Link>
  );
}
