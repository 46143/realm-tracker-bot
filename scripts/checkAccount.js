const { connectDatabase, disconnectDatabase } = require('../database/mongodb')
const { Account } = require('../database/models/account')

async function main() {
    await connectDatabase('mongodb://localhost:27017/')
    
    const discordId = '228291194747092992'
    const slot = 3
    
    console.log(`Checking account for Discord ID: ${discordId}, Slot: ${slot}`)
    
    const account = await Account.findOne({ discordId, slot })
    
    if (account) {
        console.log(`Found account:`)
        console.log(`- Gamertag: ${account.gamertag}`)
        console.log(`- XUID: ${account.xuid}`)
        console.log(`- Gamerpic: ${account.gamerpic}`)
        console.log(`- Slot: ${account.slot}`)
        console.log(`- Discord ID: ${account.discordId}`)
    } else {
        console.log('No account found')
        
        // Show all accounts for this Discord ID
        const allAccounts = await Account.find({ discordId })
        console.log(`\nAll accounts for Discord ID ${discordId}:`)
        for (const acc of allAccounts) {
            console.log(`- Slot ${acc.slot}: ${acc.gamertag} (XUID: ${acc.xuid})`)
        }
    }
    
    await disconnectDatabase()
    process.exit(0)
}

main().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
