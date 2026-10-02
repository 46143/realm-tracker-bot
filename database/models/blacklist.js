'use strict'

const mongoose = require('mongoose')

const blacklistSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: String, required: true }
})

const Blacklist = mongoose.model('blacklist', blacklistSchema)

const cache = new Set()

function normalizeId(userId) {
    return String(userId ?? '').trim()
}

async function refreshBlacklistCache() {
    const docs = await Blacklist.find({}, { userId: 1 }).lean()

    cache.clear()
    for (const doc of docs) cache.add(normalizeId(doc.userId))

    return cache.size
}

function isUserBlacklisted(userId) {
    return cache.has(normalizeId(userId))
}

async function isUserBlacklistedFresh(userId) {
    const id = normalizeId(userId)
    if (id.length === 0) return false
    if (cache.has(id)) return true

    const doc = await Blacklist.findOne({ userId: id }).lean()
    if (doc) cache.add(id)

    return Boolean(doc)
}

async function addToBlacklist(userId, addedBy) {
    const id = normalizeId(userId)
    if (id.length === 0) return false

    const doc = await Blacklist.findOneAndUpdate(
        { userId: id },
        { $set: { userId: id, addedBy, addedAt: new Date() } },
        { upsert: true, new: true }
    )

    cache.add(id)
    return doc
}

async function removeFromBlacklist(userId) {
    const id = normalizeId(userId)
    if (id.length === 0) return false

    const doc = await Blacklist.findOneAndDelete({ userId: id })
    if (doc) cache.delete(id)

    return doc
}

function getBlacklistedUserIds() {
    return [...cache]
}

module.exports = {
    Blacklist,
    refreshBlacklistCache,
    isUserBlacklisted,
    isUserBlacklistedFresh,
    addToBlacklist,
    removeFromBlacklist,
    getBlacklistedUserIds
}
