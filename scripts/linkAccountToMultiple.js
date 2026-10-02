const { connectDatabase, disconnectDatabase } = require('../database/mongodb')
const { Account, linkAccount } = require('../database/models/account')

async function main() {
    await connectDatabase('mongodb://localhost:27017/')
    
    console.log('Searching for Damianfranz 119 account...')
    
    const account = await Account.findOne({ gamertag: 'Damianfranz 119' })
    
    if (!account) {
        console.log('Account not found')
        await disconnectDatabase()
        process.exit(0)
    }
    
    console.log(`Found account: ${account.gamertag} (XUID: ${account.xuid}, Discord ID: ${account.discordId}, Slot: ${account.slot})`)
    
    // Link account to mksn (228291194747092992) in slot 3
    const targetDiscordId = '228291194747092992'
    const targetSlot = 3
    
    console.log(`\nLinking account to ${targetDiscordId} in slot ${targetSlot}...`)
    
    try {
        await linkAccount(targetDiscordId, account.xuid, account.gamertag, account.gamerpic, targetSlot)
        console.log(`Successfully linked ${account.gamertag} to ${targetDiscordId} in slot ${targetSlot}`)
    } catch (error) {
        console.error(`Failed to link account: ${error.message}`)
    }
    
    await disconnectDatabase()
    process.exit(0)
}

main().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
