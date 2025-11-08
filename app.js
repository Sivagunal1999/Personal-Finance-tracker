// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

console.log('App starting...'); // Confirm app starts

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. DATA TIER (PostgreSQL Setup) ---
console.log('DATABASE_URL:', process.env.DATABASE_URL);

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
};

if (process.env.DATABASE_URL) {
    poolConfig.ssl = { rejectUnauthorized: false };
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
        console.error('CRITICAL DATABASE ERROR:', err.stack);
        throw new Error("Database initialization failed.");
    }
}

// --- 2. MIDDLEWARE ---
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. APPLICATION TIER LOGIC ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

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
        console.log('Before initializeDatabase...');
        
        // ✅ TEMPORARY OPTION: Comment out this line to skip DB init
        await initializeDatabase();
        
        console.log('After initializeDatabase...');
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Application Tier Server successfully running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Server failed to start:", error); // Show full error object
        // Removed process.exit(1) so logs stay visible
    }
}

startServer();
