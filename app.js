// --- 1. SET UP APPLICATION TIER LIBRARIES ---
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000; // You will access the site at http://localhost:3000/

// --- 2. MIDDLEWARE (Server Setup) ---
// This tells Express to serve your HTML, CSS, and client-side JS files.
app.use(express.static(__dirname)); 
// This allows the server to read data sent from your HTML form (Presentation Tier).
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- 3. DATA TIER (Database Setup) ---
// Connect to the SQLite database file. It will be created in your folder if it doesn't exist.
const db = new sqlite3.Database(path.join(__dirname, 'finance_tracker.db'), (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Create the Transactions table if it doesn't exist.
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL, 
            amount REAL NOT NULL, 
            purpose TEXT NOT NULL, 
            category TEXT NOT NULL,
            date TEXT NOT NULL
        )`);
    }
});


// --- 4. APPLICATION TIER LOGIC (API Endpoints) ---

// A. Endpoint to handle a new transaction submission
app.post('/api/transactions', (req, res) => {
    // Data received from the Presentation Tier (the form)
    const { type, amount, purpose, category } = req.body;
    const date = new Date().toISOString().split('T')[0]; // Format today's date

    // Validate data
    if (!type || !amount || !purpose || !category) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Insert data into the Data Tier (Database)
    const sql = `INSERT INTO transactions (type, amount, purpose, category, date) VALUES (?, ?, ?, ?, ?);`
    db.run(sql, [type, amount, purpose, category, date], function(err) {
        if (err) {
            console.error('Database insertion error:', err.message);
            return res.status(500).json({ error: 'Failed to save transaction.' });
        }
        // Send a success response back to the Presentation Tier
        res.status(201).json({ 
            message: 'Transaction saved successfully!', 
            id: this.lastID,
            date: date,
            type: type,
            amount: amount,
            purpose: purpose,
            category: category
        });
    });
});

// B. Endpoint to fetch all transactions
app.get('/api/transactions', (req, res) => {
    db.all("SELECT * FROM transactions ORDER BY date DESC, id DESC", [], (err, rows) => {
        if (err) {
            console.error('Database fetch error:', err.message);
            return res.status(500).json({ error: 'Failed to retrieve transactions.' });
        }
        // Send the data retrieved from the Data Tier back to the Presentation Tier
        res.json(rows);
    });
});


// --- 5. START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Application Tier Server running at http://localhost:${PORT}`);
    console.log('Open your browser and navigate to: http://localhost:3000/');
});