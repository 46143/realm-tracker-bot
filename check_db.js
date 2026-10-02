const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

async function listAllAccounts() {
    const client = new MongoClient('mongodb://localhost:27017');
    
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        
        const db = client.db('test');
        const accountsCollection = db.collection('accounts');
        
        console.log(`\n=== All accounts in database ===`);
        const allAccounts = await accountsCollection.find({}).sort({ discordId: 1, slot: 1 }).toArray();
        allAccounts.forEach(acc => {
            console.log(`Discord ID: ${acc.discordId}, Slot: ${acc.slot}, Gamertag: ${acc.gamertag}, XUID: ${acc.xuid}`);
        });
        
        await client.close();
    } catch (err) {
        console.error('Error:', err);
        await client.close();
        process.exit(1);
    }
}

listAllAccounts();
