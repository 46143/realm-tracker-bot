const { connectDatabase, disconnectDatabase } = require('../database/mongodb')
const { Account, unlinkAccount, linkAccount } = require('../database/models/account')

async function main() {
    await connectDatabase('mongodb://localhost:27017/')
    
    const discordId = '228291194747092992'
    const targetSlot = 3
    const gamertag = 'Damianfranz 119'
    
    console.log(`Fixing account ${gamertag} for Discord ID: ${discordId}`)
    
    // Find the incorrectly linked account (slot is XUID)
    const wrongAccount = await Account.findOne({ discordId, gamertag })
    
    if (wrongAccount) {
        console.log(`Found incorrectly linked account with slot: ${wrongAccount.slot}`)
        console.log(`Deleting it...`)
        await Account.deleteOne({ discordId, gamertag })
        console.log('Deleted')
    }
    
    // Get the XUID from the original account
    const originalAccount = await Account.findOne({ gamertag })
    
    if (!originalAccount) {
        console.log('Original account not found')
        await disconnectDatabase()
        process.exit(0)
    }
    
    console.log(`Original XUID: ${originalAccount.xuid}`)
    
    // Relink with correct slot
    console.log(`Linking to slot ${targetSlot}...`)
    await linkAccount(discordId, originalAccount.xuid, gamertag, originalAccount.gamerpic, targetSlot)
    console.log(`Successfully linked ${gamertag} to ${discordId} in slot ${targetSlot}`)
    
    // Verify
    const verifyAccount = await Account.findOne({ discordId, slot: targetSlot })
    if (verifyAccount) {
        console.log(`\nVerification successful:`)
        console.log(`- Gamertag: ${verifyAccount.gamertag}`)
        console.log(`- XUID: ${verifyAccount.xuid}`)
        console.log(`- Slot: ${verifyAccount.slot}`)
        console.log(`- Discord ID: ${verifyAccount.discordId}`)
    }
    
    await disconnectDatabase()
    process.exit(0)
}

main().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
