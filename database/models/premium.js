'use strict'

const mongoose = require('mongoose')

const premiumSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: String, required: true }
})

const Premium = mongoose.model('premium', premiumSchema)

const cache = new Set()

function normalizeId(userId) {
    return String(userId ?? '').trim()
}

async function refreshPremiumCache() {
    const docs = await Premium.find({}, { userId: 1 }).lean()

    cache.clear()
    for (const doc of docs) cache.add(normalizeId(doc.userId))

    return cache.size
}

function isUserPremium(userId) {
    return cache.has(normalizeId(userId))
}

async function isUserPremiumFresh(userId) {
    const id = normalizeId(userId)
    if (id.length === 0) return false
    if (cache.has(id)) return true

    const doc = await Premium.findOne({ userId: id }).lean()
    if (doc) cache.add(id)

    return Boolean(doc)
}

async function addToPremium(userId, addedBy) {
    const id = normalizeId(userId)
    if (id.length === 0) return false

    const doc = await Premium.findOneAndUpdate(
        { userId: id },
        { $set: { userId: id, addedBy, addedAt: new Date() } },
        { upsert: true, new: true }
    )

    cache.add(id)
    return doc
}

async function removeFromPremium(userId) {
    const id = normalizeId(userId)
    if (id.length === 0) return false

    const doc = await Premium.findOneAndDelete({ userId: id })
    if (doc) cache.delete(id)

    return doc
}

function getPremiumUserIds() {
    return [...cache]
}

module.exports = {
    Premium,
    refreshPremiumCache,
    isUserPremium,
    isUserPremiumFresh,
    addToPremium,
    removeFromPremium,
    getPremiumUserIds
}
