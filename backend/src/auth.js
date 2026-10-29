const jwt = require('jsonwebtoken');

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

module.exports = { signToken, requireAuth };
