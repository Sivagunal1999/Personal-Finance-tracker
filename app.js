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
        // Return 401 for API calls
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

// Login API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = { id: user.id, username: user.username }; 
            res.json({ message: 'Login successful' });
        } else {
            // Return JSON error on failed credentials
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Login error:', err.stack);
        res.status(500).json({ error: 'Login failed due to server error' });
    }
});

// Logout API
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

// --- (Other API endpoints, like /api/register, /api/transactions, etc. are fine) ---

// --- 5. HTML ROUTES (Must be defined AFTER API calls they might block) ---

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

// Serve register page
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

// Serve forgot password page
app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'forgot-password.html'));
});

// Serve OTP verification page
app.get('/verify-otp', (req, res) => {
    res.sendFile(path.join(__dirname, 'verify-otp.html'));
});

// Serve final password reset page
app.get('/reset-password', (req, res) => {
    // Must be coming from verified OTP flow
    if (!req.session.resetIdentifier) { 
        return res.redirect('/forgot-password');
    }
    res.sendFile(path.join(__dirname, 'reset-password.html'));
});

// --- 6. START THE SERVER --- (Rest of the code remains the same)
// ... (omitted for brevity, but include the startServer async function)
