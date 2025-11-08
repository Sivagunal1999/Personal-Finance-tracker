// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. DATA TIER (PostgreSQL Setup) ---
const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Render
};

const pool = new Pool(poolConfig);

// Function to ensure the database tables exist
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                amount NUMERIC NOT NULL,
                purpose TEXT NOT NULL,
                category TEXT NOT NULL,
                date DATE NOT NULL DEFAULT CURRENT_DATE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        `);
    } catch (err) {
        console.error('Database initialization error:', err.stack);
        throw new Error("Database initialization failed.");
    }
}

// --- 2. MIDDLEWARE ---
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'your-secret-key', // Replace with a secure key
    resave: false,
    saveUninitialized: false,
}));

// --- 3. AUTHENTICATION HELPERS ---
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// --- 4. HEALTH CHECK ENDPOINT ---
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.status(200).json({ status: 'OK', dbTime: result.rows[0].now });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', message: 'Database unreachable' });
    }
});

// --- 5. ROUTES ---

// Serve homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Register new user
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hashedPassword]);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Registration error:', err.stack);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = { id: user.id, username: user.username };
            res.json({ message: 'Login successful' });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Login error:', err.stack);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

// Create transaction (protected)
app.post('/api/transactions', requireLogin, async (req, res) => {
    const { type, amount, purpose, category } = req.body;
    if (!type || !amount || !purpose || !category) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO transactions (type, amount, purpose, category)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [type, amount, purpose, category]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Database insertion error:', err.stack);
        res.status(500).json({ error: 'Failed to save transaction.' });
    }
});

// Fetch all transactions (protected)
app.get('/api/transactions', requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM transactions ORDER BY date DESC, id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error('Database fetch error:', err.stack);
        res.status(500).json({ error: 'Failed to retrieve transactions.' });
    }
});

// --- 6. START THE SERVER ---
async function startServer() {
    try {
        await initializeDatabase();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Server failed to start:", error);
    }
}

startServer();
