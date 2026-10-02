const mongoose = require('mongoose')
const { Account } = require('../database/models/account')
const config = require('../config.json')

async function updateGamerpicForSlot(slot, gamerpicPath) {
    try {
        // Connect to MongoDB
        await mongoose.connect(config.mongodbUri)
        console.log('Connected to MongoDB')

        // Update all accounts with the specified slot
        const result = await Account.updateMany(
            { slot },
            { gamerpic: gamerpicPath }
        )

        console.log(`Updated ${result.modifiedCount} accounts in slot ${slot} with gamerpic: ${gamerpicPath}`)

        // Show updated accounts
        const accounts = await Account.find({ slot })
        console.log('\nUpdated accounts:')
        accounts.forEach(acc => {
            console.log(`- ${acc.gamertag} (Slot ${acc.slot}, Discord ID: ${acc.discordId})`)
        })
    } catch (error) {
        console.error('Error updating gamerpic:', error)
    } finally {
        await mongoose.disconnect()
        console.log('\nDisconnected from MongoDB')
    }
}

// Usage: node scripts/updateGamerpic.js <slot> <gamerpic_path>
const slot = parseInt(process.argv[2]) || 2
const gamerpicPath = process.argv[3] || 'C:\\Users\\Miguel\\Downloads\\66C39BA7-D347-4A4D-AFAE-AAF4A5D2D39A.png'

updateGamerpicForSlot(slot, gamerpicPath)
