const { connectDatabase, disconnectDatabase } = require('../database/mongodb')
const { unlinkAccount } = require('../database/models/account')

async function main() {
    await connectDatabase('mongodb://localhost:27017/')
    
    const discordId = '228291194747092992'
    const slot = 3
    
    console.log(`Unlinking account for Discord ID: ${discordId}, Slot: ${slot}`)
    
    await unlinkAccount(discordId, slot)
    
    console.log(`Successfully unlinked account in slot ${slot}`)
    
    await disconnectDatabase()
    process.exit(0)
}

main().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
