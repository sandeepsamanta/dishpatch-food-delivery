export const MAX_QTY = 20;
export const emptyCart = { restaurant: null, lines: [] };

/** One cart line per dish + chosen options, so "Large with Raita" and "Regular" are separate lines. */
export const lineKey = (menuItem, options = []) =>
  `${menuItem}|${options
    .map((o) => `${o.group}:${o.name}`)
    .sort()
    .join(',')}`;

export const unitPrice = (line) => line.basePrice + line.options.reduce((s, o) => s + o.price, 0);

/** Display-only estimate. The server recomputes every price at checkout. */
export const cartSubtotal = (cart) => cart.lines.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
export const cartCount = (cart) => cart.lines.reduce((s, l) => s + l.qty, 0);

/**
 * Actions:
 *  add     { restaurant: {_id, name}, item: {_id, name, price, veg}, options, qty }
 *          Ignored when the cart holds another restaurant's items (see `replace`).
 *  replace same payload as add, but empties the cart first (after the customer confirms switching restaurants).
 *  qty     { key, qty }     qty <= 0 removes the line
 *  clear
 */
export function cartReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { restaurant, item, options = [], qty = 1 } = action;
      if (state.restaurant && state.restaurant._id !== restaurant._id) return state;
      const key = lineKey(item._id, options);
      const existing = state.lines.find((l) => l.key === key);
      const lines = existing
        ? state.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l))
        : [...state.lines, { key, menuItem: item._id, name: item.name, veg: item.veg, basePrice: item.price, options, qty: Math.min(MAX_QTY, qty) }];
      return { restaurant: { _id: restaurant._id, name: restaurant.name }, lines };
    }
    case 'replace':
      return cartReducer(emptyCart, { ...action, type: 'add' });
    case 'qty': {
      const lines = state.lines.flatMap((l) => {
        if (l.key !== action.key) return [l];
        return action.qty <= 0 ? [] : [{ ...l, qty: Math.min(MAX_QTY, action.qty) }];
      });
      return lines.length ? { ...state, lines } : emptyCart;
    }
    case 'clear':
      return emptyCart;
    default:
      return state;
  }
}

/** Shape the server expects for /orders/quote and /orders. */
export const toOrderItems = (cart) =>
  cart.lines.map((l) => ({ menuItem: l.menuItem, qty: l.qty, options: l.options.map((o) => ({ group: o.group, name: o.name })) }));
