// Check login status and update UI
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/check-session');
        const result = await response.json();

        if (result.loggedIn) {
            document.getElementById('login-btn').style.display = 'none';
            document.getElementById('register-btn').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'inline-block';
        } else {
            document.getElementById('login-btn').style.display = 'inline-block';
            document.getElementById('register-btn').style.display = 'inline-block';
            document.getElementById('logout-btn').style.display = 'none';
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }
}

// Fetch transactions
async function fetchTransactions() {
    try {
        const response = await fetch('/api/transactions');
        const transactions = await response.json();

        const tableBody = document.querySelector('#transaction-table tbody');
        tableBody.innerHTML = '';

        const categorySymbols = {
            food: '🍽️',
            salary: '💰',
            rent: '🏠',
            fun: '🎉',
            transfer: '↔️',
        };

        transactions.forEach(tx => {
            const row = tableBody.insertRow();

            if (tx.type === 'income') {
                row.style.backgroundColor = '#e9fbe9';
            } else if (tx.type === 'expense') {
                row.style.backgroundColor = '#fbe9e9';
            }

            row.insertCell().textContent = tx.date.split('T')[0];
            row.insertCell().textContent = tx.type.toUpperCase();

            const amountCell = row.insertCell();
            amountCell.textContent = `${tx.type === 'expense' ? '-' : ''}₹${parseFloat(tx.amount).toFixed(2)}`;
            amountCell.style.fontWeight = 'bold';

            row.insertCell().textContent = tx.purpose;
            row.insertCell().textContent = `${categorySymbols[tx.category] || '❓'} ${tx.category}`;
        });

    } catch (error) {
        console.error('Error fetching transactions:', error);
    }
}

// Handle form submission
document.getElementById('transaction-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = event.target;
    const transactionData = {
        type: form.type.value,
        amount: parseFloat(form.amount.value),
        purpose: form.purpose.value,
        category: form.category.value,
    };

    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(transactionData),
        });

        const result = await response.json();

        if (response.ok) {
            alert('Transaction Added: ' + result.purpose);
            form.reset();
            fetchTransactions();
        } else {
            alert('Failed to add transaction: ' + (result.error || 'Unknown error.'));
        }

    } catch (error) {
        console.error('Submission error:', error);
        alert('Failed to connect to the server.');
    }
});

// Load transactions and check login status on page load
fetchTransactions();
checkLoginStatus();
