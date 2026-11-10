import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../../api/client';
import { ErrorBox, Spinner } from '../../components/Feedback';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../hooks/useApi';
import RestaurantSettings from './RestaurantSettings';

export default function OwnerLayout() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/owner/restaurant');

  if (error) return <div className="container page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading && !data) return <Spinner />;

  // Brand-new owners must create their restaurant before anything else makes sense.
  if (!data.restaurant) {
    return (
      <div className="container page narrow-page">
        <h1>Set up your restaurant</h1>
        <p className="muted">Tell customers who you are and where you are. You can add your menu next.</p>
        <RestaurantSettings restaurant={null} onSaved={reload} />
      </div>
    );
  }

  const r = data.restaurant;
  const toggleOpen = async () => {
    try {
      await api.put('/owner/restaurant', { isOpen: !r.isOpen });
      toast.success(r.isOpen ? 'You are now closed. New orders are paused.' : 'You are open for orders.');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1>{r.name}</h1>
          <p className="muted">Restaurant dashboard</p>
        </div>
        <button className={`switch ${r.isOpen ? 'on' : ''}`} onClick={toggleOpen} role="switch" aria-checked={r.isOpen}>
          <span className="knob" />
          {r.isOpen ? 'Open for orders' : 'Closed'}
        </button>
      </div>
      <nav className="tabs" aria-label="Dashboard sections">
        <NavLink to="/owner" end>Live orders</NavLink>
        <NavLink to="/owner/overview">Overview</NavLink>
        <NavLink to="/owner/menu">Menu</NavLink>
        <NavLink to="/owner/offers">Offers</NavLink>
        <NavLink to="/owner/settings">Restaurant</NavLink>
      </nav>
      <Outlet context={{ restaurant: r, reloadRestaurant: reload }} />
    </div>
  );
}
