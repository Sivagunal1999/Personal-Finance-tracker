// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const validator = require('validator');
const twilio = require('twilio'); // NEW: Twilio library for SMS

const app = express();
const PORT = process.env.PORT || 3000;

// --- TWILIO SETUP (Reads Environment Variables) ---
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER; // Your Twilio phone number

const twilioClient = new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);


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

// API to initiate password reset (Generate and send REAL SMS/Email OTP) <-- UPDATED LOGIC
app.post('/api/forgot-password', async (req, res) => {
    const { identifier } = req.body;

    let userResult;
    // CRITICAL: We assume mobile number input for SMS
    if (validator.isMobilePhone(identifier, 'any')) { 
        userResult = await pool.query('SELECT mobile FROM users WHERE mobile = $1', [identifier]);
    } else {
        // Fallback to email if it looks like an email, although SMS is primary request
        userResult = await pool.query('SELECT email FROM users WHERE email = $1', [identifier]);
    }

    if (userResult.rows.length === 0) {
        // Return generic success to prevent fishing
        return res.json({ message: 'If user exists, code has been sent.' });
    }
    
    // Determine the actual contact point
    const contact = userResult.rows[0].mobile || userResult.rows[0].email;
    const isMobile = !!userResult.rows[0].mobile;

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

        // --- REAL TWILIO SMS SENDING LOGIC ---
        if (isMobile) {
            await twilioClient.messages.create({
                body: `Your Finance Tracker password reset code is: ${otpCode}. It expires in 10 minutes.`,
                to: contact, // User's mobile number
                from: TWILIO_PHONE_NUMBER // Your Twilio number
            });
            console.log(`SMS sent successfully to ${contact}.`);
        } else {
            // Placeholder for Email sending logic (e.g., SendGrid)
            console.log(`Email/SMS service not configured. Code generated for ${contact}: ${otpCode}`);
        }
        // --- END REAL LOGIC ---
        
        res.json({ message: 'Verification code sent.' });

    } catch (err) {
        console.error('OTP sending/generation error:', err.stack);
        // Note: Returning a generic message to the client even on failure is secure
        res.status(500).json({ error: 'Failed to initiate password reset service.' });
    }
});


// --- (Other API endpoints remain the same) ---

// --- 5. ROUTES and START SERVER (omitted for brevity) ---

// Check Session
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

// API to verify the OTP and grant reset permission
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
