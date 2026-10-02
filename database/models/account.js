const mongoose = require('mongoose')

const accountSchema = new mongoose.Schema({
    discordId: { type: String, required: true },
    slot: { type: Number, required: true, default: 1 },
    xuid: { type: String, required: true },
    gamertag: { type: String, required: true },
    gamerpic: { type: String, default: null },
    linkedAt: { type: Date, default: Date.now }
})

// Compound index for unique discordId + slot combination
accountSchema.index({ discordId: 1, slot: 1 }, { unique: true })

const Account = mongoose.model('account', accountSchema)

// Migration: Drop old unique indexes if they exist
async function migrateIndexes() {
    try {
        const indexes = await Account.collection.indexes()
        
        // Drop old discordId unique index
        const oldDiscordIdIndex = indexes.find(idx => idx.key && idx.key.discordId === 1 && !idx.key.slot)
        if (oldDiscordIdIndex && oldDiscordIdIndex.name !== 'discordId_1_slot_1') {
            await Account.collection.dropIndex(oldDiscordIdIndex.name)
            console.log(`[Migration] Dropped old index: ${oldDiscordIdIndex.name}`)
        }
        
        // Drop xuid unique index (allow same account in multiple slots)
        const xuidIndex = indexes.find(idx => idx.key && idx.key.xuid === 1 && idx.unique)
        if (xuidIndex) {
            await Account.collection.dropIndex(xuidIndex.name)
            console.log(`[Migration] Dropped xuid unique index: ${xuidIndex.name}`)
        }
    } catch (error) {
        console.log(`[Migration] No old index to drop or error: ${error.message}`)
    }
}

// Run migration on model load
migrateIndexes()

async function getAccountByDiscordId(discordId, slot = 1) {
    return Account.findOne({ discordId, slot })
}

async function getAccountsByDiscordId(discordId) {
    return Account.find({ discordId }).sort({ slot: 1 })
}

async function getAccountByXuid(xuid) {
    return Account.findOne({ xuid })
}

async function linkAccount(discordId, slot, xuid, gamertag, gamerpic = null) {
    return Account.findOneAndUpdate(
        { discordId, slot },
        { discordId, slot, xuid, gamertag, gamerpic, linkedAt: new Date() },
        { upsert: true, new: true }
    )
}

async function unlinkAccount(discordId, slot = null) {
    if (slot) {
        return Account.findOneAndDelete({ discordId, slot })
    }
    return Account.deleteMany({ discordId })
}

async function getAllAccounts() {
    return Account.find({})
}

module.exports = { Account, getAccountByDiscordId, getAccountsByDiscordId, getAccountByXuid, linkAccount, unlinkAccount, getAllAccounts }
