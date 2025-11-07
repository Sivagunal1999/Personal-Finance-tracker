// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. DATA TIER (PostgreSQL Setup) ---

// The connection string (DATABASE_URL) will be automatically provided by Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // The following line is CRITICAL for Render to connect securely:
    ssl: {
        rejectUnauthorized: false
    }
});

// Function to ensure the database table exists, executed before server start
async function initializeDatabase() {
    console.log('PostgreSQL: Attempting to connect...');
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
    await initializeDatabase(); // Wait for the DB check to complete
    app.listen(PORT, () => {
        console.log(`Application Tier Server successfully running on port ${PORT}`);
    });
}

startServer();
