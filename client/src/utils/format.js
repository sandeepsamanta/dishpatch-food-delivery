const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export const formatPrice = (n) => inr.format(Number(n) || 0);

export const formatDateTime = (d) =>
  new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const timeAgo = (d) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
};

export const STATUS_LABEL = {
  placed: 'Order placed',
  accepted: 'Accepted',
  preparing: 'Being prepared',
  ready: 'Ready for pickup',
  picked_up: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Declined by restaurant',
};

/** The happy path shown in the tracker. */
export const STEPS = ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered'];

export const couponText = (c) => {
  if (c.type === 'percent') return `${c.value}% off${c.maxDiscount ? ` up to ₹${c.maxDiscount}` : ''}`;
  if (c.type === 'flat') return `₹${c.value} off`;
  return 'Free delivery';
};
