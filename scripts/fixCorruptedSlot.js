const { connectDatabase, disconnectDatabase } = require('../database/mongodb')
const { Account } = require('../database/models/account')

async function main() {
    await connectDatabase('mongodb://localhost:27017/')
    
    console.log('Searching for accounts with invalid slot numbers...')
    
    const allAccounts = await Account.find({})
    
    for (const account of allAccounts) {
        if (typeof account.slot !== 'number' || account.slot < 1 || account.slot > 10) {
            console.log(`Found invalid slot: ${account.gamertag} (Slot: ${account.slot}, Discord ID: ${account.discordId})`)
            console.log('Deleting this account...')
            await Account.deleteOne({ _id: account._id })
            console.log('Deleted')
        }
    }
    
    console.log('\nAll accounts after cleanup:')
    const remainingAccounts = await Account.find({})
    for (const account of remainingAccounts) {
        console.log(`- ${account.gamertag} (Discord ID: ${account.discordId}, Slot: ${account.slot})`)
    }
    
    await disconnectDatabase()
    process.exit(0)
}

main().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
