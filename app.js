// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const validator = require('validator');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. DATA TIER (PostgreSQL Setup) ---
const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
};

const pool = new Pool(poolConfig);

// Function to ensure the database tables exist
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY, 
                user_id INTEGER NOT NULL,
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
                email TEXT UNIQUE NOT NULL,
                mobile TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                is_verified BOOLEAN DEFAULT FALSE
            )
        `);
        
        // TABLE for OTP tracking
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                identifier TEXT NOT NULL,  
                code TEXT NOT NULL,        
                expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
                PRIMARY KEY (identifier)
            )
        `);
        
        console.log('PostgreSQL: Tables verified/created.');
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
    secret: 'your-secret-key',
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

// --- 4. API ENDPOINTS ---

// Check Session
app.get('/api/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, username: req.session.user.username });
    } else {
        res.json({ loggedIn: false });
    }
});

// Login API (UNPROTECTED)
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
        res.status(500).json({ error: 'Login failed due to server error' });
    }
});

// Register new user API
app.post('/api/register', async (req, res) => {
    const { username, email, mobile, password } = req.body;
    
    if (!validator.isEmail(email)) { return res.status(400).json({ error: 'Invalid email format.' }); }
    if (!validator.isMobilePhone(mobile, 'any')) { return res.status(400).json({ error: 'Invalid mobile number format.' }); }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, email, mobile, password) VALUES ($1, $2, $3, $4)', 
            [username, email, mobile, hashedPassword]
        );
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        if (err.code === '23505') { return res.status(409).json({ error: 'Username, email, or mobile already in use.' }); }
        console.error('Registration error:', err.stack);
        res.status(500).json({ error: 'Registration failed due to server error.' });
    }
});

// Logout API
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

// Create transaction (protected)
app.post('/api/transactions', requireLogin, async (req, res) => {
    const { type, amount, purpose, category } = req.body;
    const userId = req.session.user.id;
    
    if (!type || !amount || !purpose || !category) { return res.status(400).json({ error: 'Missing required fields.' }); }
    
    try {
        const result = await pool.query(
            `INSERT INTO transactions (user_id, type, amount, purpose, category)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [userId, type, amount, purpose, category]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Database insertion error:', err.stack);
        res.status(500).json({ error: 'Failed to save transaction.' });
    }
});

// Fetch all transactions (protected)
app.get('/api/transactions', requireLogin, async (req, res) => {
    const userId = req.session.user.id;
    
    try {
        const result = await pool.query("SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC, id DESC", [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Database fetch error:', err.stack);
        res.status(500).json({ error: 'Failed to retrieve transactions.' });
    }
});

// Admin endpoint to view users (showing secure hash) <-- FIX: MISSING ROUTE DEFINITION
app.get('/api/admin/registered-users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, password FROM users ORDER BY id ASC');
        
        const users = result.rows.map(user => ({
            id: user.id,
            username: user.username,
            password_hash: user.password
        }));

        res.json({ 
            total_users: result.rows.length,
            users: users 
        });
    } catch (err) {
        console.error('User fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch registered users.' });
    }
});


// --- 5. HTML ROUTES ---

// Serve homepage (protected redirect)
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'forgot-password.html'));
});

app.get('/verify-otp', (req, res) => {
    res.sendFile(path.join(__dirname, 'verify-otp.html'));
});

app.get('/reset-password', (req, res) => {
    if (!req.session.resetIdentifier) { 
        return res.redirect('/forgot-password');
    }
    res.sendFile(path.join(__dirname, 'reset-password.html'));
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
