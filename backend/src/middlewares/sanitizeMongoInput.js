const sanitizeValue = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;

  const sanitized = Object.create(null);
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) continue;
    sanitized[key] = sanitizeValue(nestedValue);
  }
  return sanitized;
};

const sanitizeMongoInput = (req, res, next) => {
  if (req.body !== undefined) req.body = sanitizeValue(req.body);

  Object.defineProperty(req, 'query', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: sanitizeValue(req.query),
  });
  return next();
};

const sanitizeMongoParams = (req, res, next) => {
  req.params = sanitizeValue(req.params);
  return next();
};

module.exports = { sanitizeMongoInput, sanitizeMongoParams };
