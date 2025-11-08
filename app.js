// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. DATA TIER (PostgreSQL Setup) ---
const poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Render
};

const pool = new Pool(poolConfig);

// Function to ensure the database table exists
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
    } catch (err) {
        console.error('Database initialization error:', err.stack);
        throw new Error("Database initialization failed.");
    }
}

// --- 2. MIDDLEWARE ---
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. HEALTH CHECK ENDPOINT ---
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.status(200).json({ status: 'OK', dbTime: result.rows[0].now });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', message: 'Database unreachable' });
    }
});

// --- 4. APPLICATION LOGIC ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Create transaction
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

// Fetch all transactions
app.get('/api/transactions', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM transactions ORDER BY date DESC, id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error('Database fetch error:', err.stack);
        res.status(500).json({ error: 'Failed to retrieve transactions.' });
    }
});

// --- 5. START THE SERVER ---
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
