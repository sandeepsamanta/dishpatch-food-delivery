// The order state machine. Every change goes through these tables, so no actor can skip or reverse a step.
export const ORDER_STATUSES = ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled', 'rejected'];

/** Statuses a delivery partner can still pick the order up in, once the restaurant accepted it. */
export const CLAIMABLE = ['accepted', 'preparing', 'ready'];
/** Orders still in progress. */
export const ACTIVE = ['placed', 'accepted', 'preparing', 'ready', 'picked_up'];
/** Statuses that released (or never used) a coupon. */
export const VOID = ['cancelled', 'rejected'];

/** What the restaurant may do next, by current status. */
export const OWNER_NEXT = {
  placed: ['accepted', 'rejected'],
  accepted: ['preparing'],
  preparing: ['ready'],
};

/** What the delivery partner may do next (only for an order assigned to them). */
export const RIDER_NEXT = {
  ready: ['picked_up'],
  picked_up: ['delivered'],
};

export const CUSTOMER_CANCELLABLE = ['placed'];
