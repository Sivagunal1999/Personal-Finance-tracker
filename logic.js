// --- Client-Side JavaScript (runs in the user's browser) ---
async function fetchTransactions() {
    try {
        const response = await fetch('http://localhost:3000/api/transactions');
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

            row.insertCell().textContent = tx.date;
            row.insertCell().textContent = tx.type.toUpperCase();

            // * This is the section you showed me! *
            const amountCell = row.insertCell();
            amountCell.textContent = `${tx.type === 'expense' ? '-' : ''}₹${tx.amount.toFixed(2)}`;
            amountCell.style.fontWeight = 'bold';

            row.insertCell().textContent = tx.purpose;
            row.insertCell().textContent = `${categorySymbols[tx.category] || '❓'} ${tx.category}`;
        });

    } catch (error) {
        console.error('Error fetching transactions:', error);
    }
}

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
        const response = await fetch('http://localhost:3000/api/transactions', {
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
        alert('Failed to connect to the server. Is the server running?');
    }
});

fetchTransactions();