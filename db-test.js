const { Pool } = require('pg');

console.log('DB Test starting...');
console.log('DATABASE_URL:', process.env.DATABASE_URL);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('Database connected successfully:', result.rows);
        process.exit(0);
    } catch (err) {
        console.error('Database connection failed:', err.stack);
        process.exit(1);
    }
})();
