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
        
        // NEW TABLE for OTP tracking
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                identifier TEXT NOT NULL,  -- Email or Mobile
                code TEXT NOT NULL,        -- The 6-digit OTP
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

// --- 4. ENDPOINTS & LOGIC ---

// Health Check and Session Check (remain the same)
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT NOW()');
        res.status(200).json({ status: 'OK' });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', message: 'Database unreachable' });
    }
});

app.get('/api/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, username: req.session.user.username });
    } else {
        res.json({ loggedIn: false });
    }
});

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

// API to initiate password reset (Generate and "Send" OTP) <-- NEW OTP ENDPOINT
app.post('/api/forgot-password', async (req, res) => {
    const { identifier } = req.body;

    let userResult;
    if (validator.isEmail(identifier)) {
        userResult = await pool.query('SELECT id FROM users WHERE email = $1', [identifier]);
    } else if (validator.isMobilePhone(identifier, 'any')) {
        userResult = await pool.query('SELECT id FROM users WHERE mobile = $1', [identifier]);
    } else {
        return res.status(400).json({ error: 'Invalid identifier format.' });
    }

    if (userResult.rows.length === 0) {
        // IMPORTANT: Always return a generic success to prevent fishing for valid accounts.
        return res.json({ message: 'If user exists, code has been sent.' });
    }

    // 2. Generate and store the OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const expiresAt = new Date(Date.now() + 10 * 60000); // Expires in 10 minutes

    try {
        await pool.query(
            `INSERT INTO password_resets (identifier, code, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (identifier) DO UPDATE SET code = $2, expires_at = $3`,
            [identifier, otpCode, expiresAt]
        );

        // MOCK LOG: In a real app, Twilio/SendGrid would be called.
        // We pass the code back to the client for easy testing.
        res.json({ message: 'Verification code sent.', otpCode: otpCode });

    } catch (err) {
        console.error('OTP generation error:', err.stack);
        res.status(500).json({ error: 'Failed to initiate password reset.' });
    }
});

// API to verify the OTP and grant reset permission <-- NEW OTP ENDPOINT
app.post('/api/verify-otp', async (req, res) => {
    const { identifier, otpCode } = req.body;

    try {
        const result = await pool.query(
            'SELECT code, expires_at FROM password_resets WHERE identifier = $1', 
            [identifier]
        );
        const resetRequest = result.rows[0];

        if (!resetRequest || resetRequest.code !== otpCode) {
            return res.status(400).json({ error: 'Invalid verification code.' });
        }

        if (new Date(resetRequest.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Verification code has expired.' });
        }

        // OTP is valid: Grant permission to reset password via session flag
        req.session.resetIdentifier = identifier; 

        // Delete the code to prevent reuse
        await pool.query('DELETE FROM password_resets WHERE identifier = $1', [identifier]);

        res.json({ message: 'Code verified. Ready to reset password.' });

    } catch (err) {
        console.error('OTP verification error:', err.stack);
        res.status(500).json({ error: 'Verification failed.' });
    }
});

// API to finalize the password reset
app.post('/api/reset-password', async (req, res) => {
    const { password } = req.body;
    const identifier = req.session.resetIdentifier;

    if (!identifier) {
        return res.status(401).json({ error: 'Reset session expired or invalid.' });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Determine if identifier is email or mobile to update the correct user
        let field = validator.isEmail(identifier) ? 'email' : 'mobile';

        await pool.query(`UPDATE users SET password = $1 WHERE ${field} = $2`, [hashedPassword, identifier]);

        // Clear the session flag after successful reset
        delete req.session.resetIdentifier;
        
        res.json({ message: 'Password successfully updated.' });
    } catch (err) {
        console.error('Password reset error:', err.stack);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
});


// --- 5. ROUTES (Serve HTML Pages) ---

// Serve HTML pages (remain the same)
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

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

// Register new user, Login, Logout, Transaction Endpoints (remain the same)

// ...

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
