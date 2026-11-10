import { Link, NavLink, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useDeliveryLocation } from '../context/LocationContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { location, openPicker } = useDeliveryLocation();
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <div className="container nav-inner">
        <Link to={user ? homeFor(user.role) : '/'} className="brand">
          <span aria-hidden="true">🍽️</span> Dishpatch
        </Link>

        {(!user || user.role === 'customer') && (
          <button className="loc-chip" onClick={openPicker} title="Change delivery location">
            <span aria-hidden="true">📍</span>
            <span className="loc-label">{location.label}</span>
            <span aria-hidden="true">▾</span>
          </button>
        )}

        <nav className="nav-links" aria-label="Main">
          {(!user || user.role === 'customer') && (
            <>
              <NavLink to="/" end>Restaurants</NavLink>
              {user && <NavLink to="/orders">My orders</NavLink>}
              <NavLink to="/checkout" className="cart-link">
                🛒 Cart{count > 0 && <span className="badge">{count}</span>}
              </NavLink>
            </>
          )}
          {user?.role === 'owner' && <NavLink to="/owner">Restaurant dashboard</NavLink>}
          {user?.role === 'rider' && <NavLink to="/rider">Deliveries</NavLink>}
          {user ? (
            <span className="nav-user">
              <span className="muted small">{user.name.split(' ')[0]} · {user.role}</span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Log out
              </button>
            </span>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <Link to="/register" className="btn btn-primary btn-sm">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
