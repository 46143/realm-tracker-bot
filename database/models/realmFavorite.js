const mongoose = require('mongoose')

const realmFavoriteSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Discord ID
    realmId: { type: String, required: true },
    realmName: { type: String, required: true },
    code: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
})

// Compound index to ensure a user can only favorite a realm once
realmFavoriteSchema.index({ userId: 1, realmId: 1 }, { unique: true })

const RealmFavorite = mongoose.model('realmFavorite', realmFavoriteSchema)

async function addFavorite(userId, realmId, realmName, code) {
    try {
        return await RealmFavorite.findOneAndUpdate(
            { userId, realmId },
            { userId, realmId, realmName, code, createdAt: new Date() },
            { upsert: true, new: true }
        )
    } catch (error) {
        if (error.code === 11000) {
            // Already favorited
            return await RealmFavorite.findOne({ userId, realmId })
        }
        throw error
    }
}

async function removeFavorite(userId, realmId) {
    return await RealmFavorite.findOneAndDelete({ userId, realmId })
}

async function getUserFavorites(userId) {
    return RealmFavorite.find({ userId }).sort({ createdAt: -1 })
}

async function isFavorite(userId, realmId) {
    const favorite = await RealmFavorite.findOne({ userId, realmId })
    return !!favorite
}

async function getAllRealmCodesWithFavorites(userId) {
    const allCodes = await RealmFavorite.find({}).sort({ createdAt: -1 })
    
    // Mark favorites for the user
    return allCodes.map(code => ({
        ...code.toObject(),
        isFavorite: code.userId === userId
    }))
}

module.exports = {
    RealmFavorite,
    addFavorite,
    removeFavorite,
    getUserFavorites,
    isFavorite,
    getAllRealmCodesWithFavorites
}
