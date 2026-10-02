const { connectDatabase, disconnectDatabase } = require('../database/mongodb')
const { Account } = require('../database/models/account')

async function main() {
    await connectDatabase('mongodb://localhost:27017/')
    
    const discordId = '228291194747092992'
    const targetSlot = 3
    const gamertag = 'Damianfranz 119'
    
    console.log(`Manually linking account ${gamertag} to Discord ID: ${discordId}, Slot: ${targetSlot}`)
    
    // Get the XUID from the original account
    const originalAccount = await Account.findOne({ gamertag })
    
    if (!originalAccount) {
        console.log('Original account not found')
        await disconnectDatabase()
        process.exit(0)
    }
    
    console.log(`Original XUID: ${originalAccount.xuid}`)
    console.log(`Original Gamerpic: ${originalAccount.gamerpic}`)
    
    // Delete any existing entry for this discordId and gamertag
    await Account.deleteMany({ discordId, gamertag })
    
    // Manually insert the account with correct slot
    const newAccount = new Account({
        discordId,
        slot: targetSlot,
        xuid: originalAccount.xuid,
        gamertag,
        gamerpic: originalAccount.gamerpic,
        linkedAt: new Date()
    })
    
    await newAccount.save()
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
