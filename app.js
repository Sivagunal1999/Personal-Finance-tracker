// --- Application Tier using Express and PostgreSQL (pg) ---

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
// Use the port provided by the hosting environment (Render), or default to 3000 locally
const PORT = process.env.PORT || 3000; 

// --- 1. DATA TIER (PostgreSQL Setup) ---

// The connection string (DATABASE_URL) will be automatically provided by Render 
// when we link it to the database we create there.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Render connections
    }
});

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
        console.log('PostgreSQL: Transactions table verified/created successfully.');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}

// Call the function to set up the table
initializeDatabase();

// --- 2. MIDDLEWARE ---

// Serve static files (index.html, styles.css, logic.js)
app.use(express.static(path.join(__dirname))); 
// Allow the server to read form data
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

        // Return the created record
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

        // Send the data retrieved from the Data Tier back to the Presentation Tier
        res.json(result.rows);
    } catch (err) {
        console.error('Database fetch error:', err);
        res.status(500).json({ error: 'Failed to retrieve transactions.' });
    }
});


// --- 4. START THE SERVER ---
app.listen(PORT, () => {
    console.log(Application Tier Server running on port ${PORT});
    console.log(Access the site via the Render URL.);
});
