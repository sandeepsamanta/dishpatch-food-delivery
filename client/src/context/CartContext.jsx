import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { cartCount, cartReducer, cartSubtotal, emptyCart } from './cartReducer';

const KEY = 'dishpatch.cart';
const CartContext = createContext(null);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && Array.isArray(saved.lines)) return saved;
  } catch {
    /* corrupt or unavailable storage: start empty */
  }
  return emptyCart;
}

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(cartReducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart]);

  const value = useMemo(
    () => ({
      cart,
      count: cartCount(cart),
      subtotal: cartSubtotal(cart),
      add: (restaurant, item, options = [], qty = 1) => dispatch({ type: 'add', restaurant, item, options, qty }),
      replaceWith: (restaurant, item, options = [], qty = 1) => dispatch({ type: 'replace', restaurant, item, options, qty }),
      setQty: (key, qty) => dispatch({ type: 'qty', key, qty }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [cart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
