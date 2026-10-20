const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const Sentiment = require('sentiment');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_KEY = 'admin123'; // change this
const db = new DatabaseSync(path.join(__dirname, 'feedback.db'));
const analyzer = new Sentiment();

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL,
  customer TEXT NOT NULL, rating INTEGER NOT NULL, comment TEXT NOT NULL,
  sentiment TEXT, score REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
`);

// add user_id column to old databases (ignore if it already exists)
try { db.exec('ALTER TABLE reviews ADD COLUMN user_id INTEGER'); } catch (e) {}

// ---- Authentication helpers (password hashing + signed token) ----
const SECRET = 'change-this-secret-key';
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 32).toString('hex'); }
function makeToken(u) {
  const p = Buffer.from(JSON.stringify({ id: u.id, name: u.name, exp: Date.now() + 7 * 864e5 })).toString('base64url');
  const s = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  return p + '.' + s;
}
function readToken(t) {
  try {
    const [p, s] = t.split('.');
    const e = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
    if (s !== e) return null;
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp > Date.now() ? d : null;
  } catch (err) { return null; }
}
const auth = (req, res, next) => {
  const u = readToken((req.headers.authorization || '').replace('Bearer ', ''));
  if (!u) return res.status(401).json({ error: 'Please login first' });
  req.user = u; next();
};

if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
  const ins = db.prepare('INSERT INTO products(name,description) VALUES(?,?)');
  ins.run('Wireless Headphones', 'Noise-cancelling over-ear headphones');
  ins.run('Smart Watch', 'Fitness tracking with heart-rate monitor');
  ins.run('Laptop Backpack', 'Water-resistant, fits 15-inch laptops');
}

// AI: sentiment analysis on review text
function classify(text) {
  const r = analyzer.analyze(text);
  const score = r.comparative;
  const label = score > 0.15 ? 'Positive' : score < -0.15 ? 'Negative' : 'Neutral';
  return { label, score: Number(score.toFixed(3)) };
}

const admin = (req, res, next) =>
  req.headers['x-admin-key'] === ADMIN_KEY ? next() : res.status(401).json({ error: 'Unauthorized' });

app.get('/api/products', (req, res) => {
  res.json(db.prepare(`
    SELECT p.*, ROUND(AVG(r.rating),1) avg_rating, COUNT(r.id) review_count
    FROM products p LEFT JOIN reviews r ON r.product_id = p.id GROUP BY p.id`).all());
});

app.get('/api/products/:id/reviews', (req, res) => {
  res.json(db.prepare('SELECT * FROM reviews WHERE product_id=? ORDER BY id DESC').all(req.params.id));
});

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and password (min 6 characters) required' });
  const mail = email.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(mail))
    return res.status(400).json({ error: 'Email already registered' });
  const salt = crypto.randomBytes(16).toString('hex');
  const r = db.prepare('INSERT INTO users(name,email,salt,password_hash) VALUES(?,?,?,?)')
    .run(name.trim(), mail, salt, hashPw(password, salt));
  const user = { id: Number(r.lastInsertRowid), name: name.trim() };
  res.json({ token: makeToken(user), name: user.name });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').trim().toLowerCase());
  if (!u || hashPw(password || '', u.salt) !== u.password_hash)
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: makeToken(u), name: u.name });
});

app.post('/api/reviews', auth, (req, res) => {
  const { product_id, rating, comment } = req.body;
  if (!product_id || !comment || !(rating >= 1 && rating <= 5))
    return res.status(400).json({ error: 'All fields required, rating 1-5' });
  if (db.prepare('SELECT id FROM reviews WHERE product_id=? AND user_id=?').get(product_id, req.user.id))
    return res.status(400).json({ error: 'You already reviewed this product' });
  const { label, score } = classify(comment);
  db.prepare(`INSERT INTO reviews(product_id,user_id,customer,rating,comment,sentiment,score)
              VALUES(?,?,?,?,?,?,?)`).run(product_id, req.user.id, req.user.name, rating, comment.trim(), label, score);
  res.json({ ok: true, sentiment: label });
});

app.get('/api/admin/reviews', admin, (req, res) => {
  res.json(db.prepare(`SELECT r.*, p.name product FROM reviews r
    JOIN products p ON p.id=r.product_id ORDER BY r.id DESC`).all());
});

app.get('/api/admin/stats', admin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c, ROUND(AVG(rating),2) a FROM reviews').get();
  const by = db.prepare('SELECT sentiment, COUNT(*) c FROM reviews GROUP BY sentiment').all();
  const ratings = db.prepare('SELECT rating, COUNT(*) c FROM reviews GROUP BY rating').all();
  res.json({ total: total.c, avg: total.a || 0, sentiment: by, ratings });
});

app.delete('/api/admin/reviews/:id', admin, (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/products', admin, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  db.prepare('INSERT INTO products(name,description) VALUES(?,?)').run(name, description || '');
  res.json({ ok: true });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
