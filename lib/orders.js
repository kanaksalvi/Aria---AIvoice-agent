
export const ORDERS = {
  'ORD-101': { order_id: 'ORD-101', customer: 'Priya Sharma', product: 'Vitamin C Serum (30ml)', value_inr: 699, status: 'Out for Delivery', carrier: 'BlueDart', tracking_id: 'BD-982103', note: 'Expected by 6 PM today', delivered_days_ago: null },
  'ORD-102': { order_id: 'ORD-102', customer: 'Rahul Verma', product: 'Hydrating Sunscreen SPF 50', value_inr: 499, status: 'Delivered', carrier: 'Delhivery', tracking_id: 'DL-441029', note: 'Delivered 14 days ago', delivered_days_ago: 14 },
  'ORD-103': { order_id: 'ORD-103', customer: 'Ananya Patel', product: 'Green Tea Face Wash + Toner', value_inr: 850, status: 'Processing', carrier: null, tracking_id: null, note: 'Ordered 3 hours ago. Eligible for cancellation', delivered_days_ago: null },
};

const WORD_DIGITS = { zero: 0, oh: 0, o: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };


export function normalizeOrderId(raw) {
  if (!raw) return null;
  let s = String(raw).toLowerCase().replace(/o\W*r\W*d/g, ' ');
  s = s.replace(/\b(zero|oh|o|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => WORD_DIGITS[w]);
  const digits = s.replace(/\D/g, '');
  return digits ? `ORD-${digits}` : null;
}

function eligibility(o) {
  const n = o.delivered_days_ago;
  const cancel =
    o.status === 'Processing' ? { allowed: true, reason: 'Order is still Processing.' }
    : o.status === 'Cancelled' ? { allowed: false, reason: 'Order is already cancelled.' }
    : o.status === 'Delivered' ? { allowed: false, reason: 'Order is already delivered, so it cannot be cancelled.' }
    : { allowed: false, reason: `Order is ${o.status}. Cancellation is only possible while Processing. The customer may refuse delivery at the doorstep.` };
  let ret;
  if (o.status !== 'Delivered') ret = { allowed: false, reason: 'Order has not been delivered, so a return cannot be started.' };
  else if (n > 7) ret = { allowed: false, reason: `Delivered ${n} days ago; returns are only accepted within 7 days of delivery. The 48-hour damaged/defective window has also passed.` };
  else ret = { allowed: 'conditional', reason: 'Within the 7-day window. Return only if unopened, unused and in original packaging - ask the customer. Damaged/defective items must be reported within 48 hours of delivery with photos (replacement).' };
  return { cancel, return: ret, cod_available: o.value_inr <= 2500, shipping_fee_inr: o.value_inr > 499 ? 0 : 50 };
}

export function getOrderDetails(raw, overrides = {}) {
  const id = normalizeOrderId(raw);
  if (!id) return { found: false, error: 'missing_or_unreadable_order_id', message: 'No usable order ID. Ask the customer for it (format ORD-123).' };
  const base = ORDERS[id];
  if (!base) return { found: false, order_id: id, error: 'order_not_found', message: `No order ${id} exists. Ask the customer to repeat or verify the ID. Do not guess.` };
  const order = { ...base, status: overrides[id] || base.status };
  return { found: true, order, eligibility: eligibility(order) };
}

export function cancelOrder(raw, overrides = {}) {
  const d = getOrderDetails(raw, overrides);
  if (!d.found) return d;
  if (!d.eligibility.cancel.allowed) return { success: false, order_id: d.order.order_id, reason: d.eligibility.cancel.reason };
  return { success: true, order_id: d.order.order_id, updated_status: 'Cancelled', message: 'Order cancelled.' };
}
