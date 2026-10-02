const mongoose = require('mongoose')

const realmCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    realmId: { type: String, required: true },
    realmName: { type: String, required: true },
    usedBy: { type: String, required: true }, // Discord ID
    usedAt: { type: Date, default: Date.now }
})

const RealmCode = mongoose.model('realmCode', realmCodeSchema)

async function addRealmCode(code, realmId, realmName, usedBy) {
    try {
        return await RealmCode.findOneAndUpdate(
            { code },
            { code, realmId, realmName, usedBy, usedAt: new Date() },
            { upsert: true, new: true }
        )
    } catch (error) {
        if (error.code === 11000) {
            // Code already exists, just update the usage info
            return await RealmCode.findOneAndUpdate(
                { code },
                { realmId, realmName, usedBy, usedAt: new Date() },
                { new: true }
            )
        }
        throw error
    }
}

async function getAllRealmCodes() {
    return RealmCode.find({}).sort({ usedAt: -1 })
}

async function getRealmCodeByCode(code) {
    return RealmCode.findOne({ code })
}

async function deleteRealmCode(code) {
    return RealmCode.findOneAndDelete({ code })
}

async function clearRealmCodes() {
    return RealmCode.deleteMany({})
}

module.exports = {
    RealmCode,
    addRealmCode,
    getAllRealmCodes,
    getRealmCodeByCode,
    deleteRealmCode,
    clearRealmCodes
}
