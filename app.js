// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const validator = require('validator'); // NEW: Import validator

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
                id SERIAL PRIMARY PRIMARY KEY,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                amount NUMERIC NOT NULL,
                purpose TEXT NOT NULL,
                category TEXT NOT NULL,
                date DATE NOT NULL DEFAULT CURRENT_DATE
            )
        `);

        // FIX: Updated users table schema
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,       -- NEW COLUMN
                mobile TEXT UNIQUE NOT NULL,      -- NEW COLUMN
                password TEXT NOT NULL,
                is_verified BOOLEAN DEFAULT FALSE -- Optional: For future OTP
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

// ... (Other endpoints remain the same) ...

// Register new user <-- UPDATED LOGIC
app.post('/api/register', async (req, res) => {
    const { username, email, mobile, password } = req.body;

    // VALIDATION: Ensure inputs are valid
    if (!validator.isEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format.' });
    }
    // Simple validation for mobile number (adjust format as needed)
    if (!validator.isMobilePhone(mobile, 'any')) { 
        return res.status(400).json({ error: 'Invalid mobile number format.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        // FIX: Insert new fields into the users table
        await pool.query(
            'INSERT INTO users (username, email, mobile, password) VALUES ($1, $2, $3, $4)', 
            [username, email, mobile, hashedPassword]
        );
        
        // Success response
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        // Handle unique constraint violation (username/email/mobile already exists)
        if (err.code === '23505') { 
            return res.status(409).json({ error: 'Username, email, or mobile already in use.' });
        }
        console.error('Registration error:', err.stack);
        res.status(500).json({ error: 'Registration failed due to server error.' });
    }
});

// ... (Rest of app.js) ...

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
