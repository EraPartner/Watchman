// Simple request body validation helpers (no external deps)
export function requireFields(fields) {
  return (req, res, next) => {
    const body = req.body || {};
    for (const f of fields) {
      if (!(f in body)) {
        return res.status(400).json({ error: `Missing field: ${f}` });
      }
    }
    next();
  };
}

export function requireBoolean(field) {
  return (req, res, next) => {
    const val = req.body && req.body[field];
    if (typeof val !== 'boolean') {
      return res.status(400).json({ error: `Field ${field} must be boolean` });
    }
    next();
  };
}

export function requireString(field) {
  return (req, res, next) => {
    const val = req.body && req.body[field];
    if (typeof val !== 'string' || val.trim().length === 0) {
      return res.status(400).json({ error: `Field ${field} must be a non-empty string` });
    }
    next();
  };
}
