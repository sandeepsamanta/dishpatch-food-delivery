import { describe, expect, it } from 'vitest';
import { cartCount, cartReducer, cartSubtotal, emptyCart, lineKey, MAX_QTY, toOrderItems } from './cartReducer';

const shop = { _id: 'r1', name: 'Spice Route' };
const biryani = { _id: 'd1', name: 'Biryani', price: 200, veg: false };
const large = [{ group: 'Size', name: 'Large', price: 80 }];

describe('cartReducer', () => {
  it('adds items and remembers the restaurant', () => {
    const cart = cartReducer(emptyCart, { type: 'add', restaurant: shop, item: biryani });
    expect(cart.restaurant).toEqual(shop);
    expect(cart.lines).toHaveLength(1);
    expect(cartCount(cart)).toBe(1);
  });

  it('merges the same dish with the same options, but not with different options', () => {
    let cart = cartReducer(emptyCart, { type: 'add', restaurant: shop, item: biryani, options: large });
    cart = cartReducer(cart, { type: 'add', restaurant: shop, item: biryani, options: large });
    cart = cartReducer(cart, { type: 'add', restaurant: shop, item: biryani, options: [] });
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0].qty).toBe(2);
    expect(cartSubtotal(cart)).toBe(280 * 2 + 200);
  });

  it('ignores option order when keying lines', () => {
    const a = [{ group: 'Add-ons', name: 'Raita' }, { group: 'Size', name: 'Large' }];
    expect(lineKey('d1', a)).toBe(lineKey('d1', [...a].reverse()));
  });

  it("refuses another restaurant's dish unless replaced", () => {
    const cart = cartReducer(emptyCart, { type: 'add', restaurant: shop, item: biryani });
    const other = { _id: 'r2', name: 'Pizza Place' };
    const pizza = { _id: 'd9', name: 'Pizza', price: 300, veg: true };
    expect(cartReducer(cart, { type: 'add', restaurant: other, item: pizza })).toBe(cart);
    const switched = cartReducer(cart, { type: 'replace', restaurant: other, item: pizza });
    expect(switched.restaurant._id).toBe('r2');
    expect(switched.lines.map((l) => l.name)).toEqual(['Pizza']);
  });

  it('changes quantity, caps it, and removes at zero (emptying the cart resets the restaurant)', () => {
    let cart = cartReducer(emptyCart, { type: 'add', restaurant: shop, item: biryani });
    const key = cart.lines[0].key;
    cart = cartReducer(cart, { type: 'qty', key, qty: 99 });
    expect(cart.lines[0].qty).toBe(MAX_QTY);
    cart = cartReducer(cart, { type: 'qty', key, qty: 0 });
    expect(cart).toEqual(emptyCart);
  });

  it('sends only ids, quantities and option names to the server', () => {
    const cart = cartReducer(emptyCart, { type: 'add', restaurant: shop, item: biryani, options: large, qty: 2 });
    expect(toOrderItems(cart)).toEqual([{ menuItem: 'd1', qty: 2, options: [{ group: 'Size', name: 'Large' }] }]);
  });
});
