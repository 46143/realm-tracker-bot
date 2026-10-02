const { connectDatabase, disconnectDatabase } = require('../database/mongodb')
const { Account, unlinkAccount, linkAccount } = require('../database/models/account')

async function main() {
    await connectDatabase('mongodb://localhost:27017/')
    
    console.log('Searching for Damianfranz 119 account...')
    
    const account = await Account.findOne({ gamertag: 'Damianfranz 119' })
    
    if (!account) {
        console.log('Account not found')
        await disconnectDatabase()
        process.exit(0)
    }
    
    console.log(`Found account: ${account.gamertag} (Discord ID: ${account.discordId}, Slot: ${account.slot})`)
    
    // Search for users by looking at all accounts
    const allAccounts = await Account.find({})
    const userMap = new Map()
    
    for (const acc of allAccounts) {
        if (!userMap.has(acc.discordId)) {
            userMap.set(acc.discordId, acc.gamertag)
        }
    }
    
    console.log('\nAll Discord IDs with accounts:')
    for (const [discordId, gamertag] of userMap) {
        console.log(`- ${discordId}: ${gamertag}`)
    }
    
    await disconnectDatabase()
    process.exit(0)
}

main().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
