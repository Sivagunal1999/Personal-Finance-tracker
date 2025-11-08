// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

console.log('App starting...'); // Top-level log to confirm app starts

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. DATA TIER (PostgreSQL Setup) ---

// Log DATABASE_URL to confirm it's being read correctly
console.log('DATABASE_URL:', process.env.DATABASE_URL);

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
};

// Add SSL config for Render deployment
if (process.env.DATABASE_URL) {
    poolConfig.ssl = {
        rejectUnauthorized: false
    };
}

const pool = new Pool(poolConfig);

// Function to ensure the database table exists
async function initializeDatabase() {
    try {
        console.log('PostgreSQL: Attempting to connect and verify table...');
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
        console.log('PostgreSQL: Transactions table verified/created successfully.');
    } catch (err) {
        console.error('CRITICAL DATABASE ERROR:', err.stack); // Show full error stack
        throw new Error("Database initialization failed.");
    }
}

// --- 2. MIDDLEWARE ---
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. APPLICATION TIER LOGIC (API Endpoints) ---

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// A. Create transaction
app.post('/api/transactions', async (req, res) => {
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

// B. Fetch all transactions
app.get('/api/transactions', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM transactions ORDER BY date DESC, id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error('Database fetch error:', err.stack);
        res.status(500).json({ error: 'Failed to retrieve transactions.' });
    }
});

// --- 4. START THE SERVER ---
async function startServer() {
    try {
        await initializeDatabase();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Application Tier Server successfully running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Server failed to start:", error); // Show full error object
        // Removed process.exit(1) so logs stay visible
    }
}

startServer();
