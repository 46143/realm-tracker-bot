const { connectDatabase, disconnectDatabase } = require('../database/mongodb')
const { Account } = require('../database/models/account')

async function main() {
    await connectDatabase('mongodb://localhost:27017/')
    
    console.log('Searching for accounts that fail token refresh...')
    
    const accounts = await Account.find({})
    
    if (!accounts || accounts.length === 0) {
        console.log('No accounts found')
        await disconnectDatabase()
        process.exit(0)
    }
    
    console.log(`Found ${accounts.length} accounts:`)
    for (const account of accounts) {
        console.log(`- ${account.gamertag} (Discord ID: ${account.discordId}, Slot: ${account.slot})`)
    }
    
    // Remove WavierJarl3032 account
    const result = await Account.deleteOne({ gamertag: 'WavierJarl3032' })
    
    if (result.deletedCount > 0) {
        console.log(`Removed WavierJarl3032 account`)
    } else {
        console.log('WavierJarl3032 account not found')
    }
    
    await disconnectDatabase()
    process.exit(0)
}

main().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
