/**
 * Phase 16 security pass.
 *
 * Any value from req.body/req.query that ends up inside a Mongoose
 * `.find()`/`.findOne()`/`.deleteOne()` filter object must be a plain
 * string - otherwise a client can send e.g. `{"email": {"$ne": null}}` as
 * JSON, or `?subject[$ne]=` as a query string, and MongoDB will interpret
 * the object as a query operator instead of a value to match ("NoSQL
 * injection"). req.params values are exempt - Express path segments are
 * always plain strings, never nested objects.
 *
 * asQueryString() is the guard: pass it anything headed into a filter
 * object and it returns a safe string, or undefined if the input wasn't a
 * plain string to begin with (letting the caller 400 or just omit the
 * filter field instead of ever handing the raw value to Mongoose).
 */
function asQueryString(value, { maxLength = 200 } = {}) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

module.exports = { asQueryString };
