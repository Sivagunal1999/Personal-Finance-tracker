// --- Client-Side JavaScript (runs in the user's browser) ---

// This function fetches data from the server and updates the table
async function fetchTransactions() {
    try {
        // Use relative path for cloud deployment
        const response = await fetch('/api/transactions');
        const transactions = await response.json();
        
        const tableBody = document.querySelector('#transaction-table tbody');
        tableBody.innerHTML = ''; 

        // Map icons to categories
        const categorySymbols = {
            food: '🍽️',
            salary: '💰',
            rent: '🏠',
            fun: '🎉',
            transfer: '↔️',
        };

        transactions.forEach(tx => {
            const row = tableBody.insertRow();
            
            // Set background color for Income/Expense
            if (tx.type === 'income') {
                row.style.backgroundColor = '#e9fbe9'; 
            } else if (tx.type === 'expense') {
                row.style.backgroundColor = '#fbe9e9'; 
            }

            row.insertCell().textContent = tx.date.split('T')[0]; // Display only the date
            row.insertCell().textContent = tx.type.toUpperCase();
            
            // Format amount as currency
            const amountCell = row.insertCell();
            amountCell.textContent = `${tx.type === 'expense' ? '-' : ''}₹${parseFloat(tx.amount).toFixed(2)}`;
            amountCell.style.fontWeight = 'bold';

            row.insertCell().textContent = tx.purpose;
            
            // Add category symbol (The fixed line!)
            row.insertCell().textContent = `${categorySymbols[tx.category] || '❓'} ${tx.category}`;
        });

    } catch (error) {
        console.error('Error fetching transactions:', error);
    }
}


// This handles the form submission when the user clicks "Add Transaction"
document.getElementById('transaction-form').addEventListener('submit', async (event) => {
    event.preventDefault(); 

    const form = event.target;
    // Gather all form data
    const transactionData = {
        type: form.type.value,
        amount: parseFloat(form.amount.value), 
        purpose: form.purpose.value,
        category: form.category.value,
    };

    try {
        // Communicate with the Application Tier (POST /api/transactions)
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

// Load transactions when the page loads
fetchTransactions();
