const { connectDatabase, disconnectDatabase } = require('../database/mongodb')
const { unlinkAccount, Account } = require('../database/models/account')

async function main() {
    await connectDatabase('mongodb://localhost:27017/')
    
    console.log('Searching for account WavierJarl3032...')
    
    const account = await Account.findOne({ gamertag: 'WavierJarl3032' })
    
    if (!account) {
        console.log('Account not found')
        await disconnectDatabase()
        process.exit(0)
    }
    
    console.log(`Found account: ${account.gamertag} (Discord ID: ${account.discordId}, Slot: ${account.slot})`)
    
    await unlinkAccount(account.discordId, account.slot)
    
    console.log('Account unlinked successfully')
    
    await disconnectDatabase()
    process.exit(0)
}

main().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
