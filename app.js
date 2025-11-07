// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. DATA TIER (PostgreSQL Setup) ---

// Configuration for the database connection pool
const poolConfig = {
    connectionString: process.env.DATABASE_URL,
};

// CRITICAL: Only add the SSL configuration if we are NOT running locally.
// Render environment variables will include 'RENDER' or run on a specific host.
if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) {
    poolConfig.ssl = {
        rejectUnauthorized: false
    };
}

const pool = new Pool(poolConfig);

// Function to ensure the database table exists, executed before server start
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
        console.error('CRITICAL DATABASE ERROR:', err);
        // Must re-throw error to crash and show the issue in the log
        throw new Error("Database initialization failed.");
    }
}

// --- 2. MIDDLEWARE ---

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- 3. APPLICATION TIER LOGIC (API Endpoints) ---

// A. Endpoint to handle a new transaction submission (CREATE)
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
        console.error('Database insertion error:', err);
        res.status(500).json({ error: 'Failed to save transaction.' });
    }
});

// B. Endpoint to fetch all transactions (READ)
app.get('/api/transactions', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM transactions ORDER BY date DESC, id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error('Database fetch error:', err);
        res.status(500).json({ error: 'Failed to retrieve transactions.' });
    }
});


// --- 4. START THE SERVER (Execute DB initialization before listening) ---
async function startServer() {
    try {
        await initializeDatabase(); // Wait for the DB check to complete
        app.listen(PORT, () => {
            console.log(`Application Tier Server successfully running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Server failed to start:", error.message);
        // Exit the process so Render knows it failed definitively
        process.exit(1); 
    }
}

startServer();
