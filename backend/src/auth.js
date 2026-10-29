const jwt = require('jsonwebtoken');
const users = require('./userService');

const secret = () => {
  if (!process.env.JWT_SECRET) throw Object.assign(new Error('JWT_SECRET is not set on the server'), { status: 500 });
  return process.env.JWT_SECRET;
};

const signToken = (user) =>
  jwt.sign({ user_id: user.user_id, role: user.role }, secret(), { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

function requireAuth(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return res.status(401).json({ error: 'Authentication required' });
  try {
    const { user_id, role } = jwt.verify(m[1], secret());
    req.user = { user_id, role };
    next();
  } catch (e) {
    if (e.status) return next(e);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const requireSales = (req, res, next) =>
  req.user.role === 'sales' ? next() : res.status(403).json({ error: 'Sales access required' });

// Token role is checked first, then the database, so deleted/demoted admins lose access immediately.
async function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    const u = await users.getById(req.user.user_id);
    if (!u || u.role !== 'admin') return res.status(401).json({ error: 'User no longer exists' });
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { signToken, requireAuth, requireSales, requireAdmin };
