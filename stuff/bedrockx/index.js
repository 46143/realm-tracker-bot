const { createRealmClient } = require('./client')
const { unregisterRelaysForClient } = require('./chatRelay')
const { describeDisconnect } = require('../utils/disconnectReasons')
const { isRealmWhitelisted } = require('../../database/models/whitelist')
const logger = require('../utils/logger')

const activeConnections = new Map()

function connectionKey(discordId, realmId) {
    return `${discordId}:${realmId}`
}

function hasActiveConnection(discordId, realmId) {
    return activeConnections.has(connectionKey(discordId, realmId))
}

function getActiveConnection(discordId, realmId) {
    return activeConnections.get(connectionKey(discordId, realmId))
}

function connectToRealm(discordId, realmId, authflow, connection, deviceProfile, instantResolve = false) {
    return new Promise((resolve, reject) => {
        const key = connectionKey(discordId, realmId)

        logger.debug(`[connectToRealm] Starting connection for ${discordId} to realm ${realmId}`)
        logger.debug(`[connectToRealm] Connection type: ${connection.transport}, address: ${connection.ip || connection.networkId}`)
        logger.debug(`[connectToRealm] Instant resolve: ${instantResolve}`)

        if (isRealmWhitelisted(realmId)) {
            logger.debug(`[connectToRealm] Realm ${realmId} is whitelisted, rejecting`)
            reject(new Error('This Realm is whitelisted. No operations can be performed on it.'))
            return
        }

        if (activeConnections.has(key)) {
            logger.debug(`[connectToRealm] Connection already active for ${key}`)
            reject(new Error('A connection to this realm is already active'))
            return
        }

        logger.debug(`[connectToRealm] Creating client...`)
        const client = createRealmClient(authflow, connection, deviceProfile)
        let settled = false
        let sessionReceived = false

        const timeout = setTimeout(() => {
            if (settled) return
            settled = true

            logger.error(`[connectToRealm] Connection timed out after 30s for realm ${realmId}`)
            logger.error(`[connectToRealm] Session event received: ${sessionReceived ? 'yes' : 'no'}`)
            logger.error(`[connectToRealm] Client status: ${client.status || 'unknown'}`)
            logger.error(`[connectToRealm] Connection type: ${connection.transport}, address: ${connection.ip || connection.networkId}`)
            logger.error(`[connectToRealm] Instant resolve: ${instantResolve}`)
            
            client.disconnect('Connection timed out')
            reject(new Error('Connection timed out'))
        }, 30000)

        logger.debug(`[connectToRealm] Client created, waiting for start_game event...`)
        activeConnections.set(key, client)

        // Add more debug logs for connection events
        client.on('session', () => {
            sessionReceived = true
            logger.debug(`[connectToRealm] Session event received for realm ${realmId}`)
        })

        client.on('resource_packs_info', () => {
            logger.debug(`[connectToRealm] Resource packs info event received for realm ${realmId}`)
        })

        client.on('resource_pack_stack', () => {
            logger.debug(`[connectToRealm] Resource pack stack event received for realm ${realmId}`)
        })

        client.on('resource_pack_client_response', () => {
            logger.debug(`[connectToRealm] Resource pack client response event received for realm ${realmId}`)
        })

        client.on('network_stack_loaded', () => {
            logger.debug(`[connectToRealm] Network stack loaded event received for realm ${realmId}`)
        })

        client.on('client_cache_status', () => {
            logger.debug(`[connectToRealm] Client cache status event received for realm ${realmId}`)
        })

        // Instant resolve for spamming without join message
        if (instantResolve) {
            logger.debug(`[connectToRealm] Instant resolving client for spam without join message`)
            settled = true
            clearTimeout(timeout)
            
            // Set runtime manually to allow chat
            client.runtime = 1n
            
            resolve(client)
            return
        }

        client.once('start_game', () => {
            if (settled) return
            settled = true

            logger.debug(`[connectToRealm] start_game event received for realm ${realmId}`)
            clearTimeout(timeout)
            resolve(client)
        })

        client.on('kick', (data) => {
            const alreadySettled = settled
            settled = true

            logger.error(`[connectToRealm] Client kicked from realm ${realmId}: ${JSON.stringify(data)}`)
            clearTimeout(timeout)
            activeConnections.delete(key)
            unregisterRelaysForClient(client)

            if (!alreadySettled) reject(new Error(describeDisconnect(data)))
        })

        client.on('error', (error) => {
            const message = String(error?.message ?? error)
            const recoverable = error?.partialReadError || /read error|partial|incomplete|out of bounds/i.test(message)

            logger.debug(`[connectToRealm] Client error: ${message}, recoverable: ${recoverable}, settled: ${settled}`)

            if (settled && recoverable) {
                logger.warn(`[realm ${realmId}] ignoring packet parse error: ${message}`)
                return
            }

            const alreadySettled = settled
            settled = true

            logger.error(`[connectToRealm] Fatal error for realm ${realmId}: ${message}`)
            clearTimeout(timeout)
            activeConnections.delete(key)
            unregisterRelaysForClient(client)

            if (alreadySettled) {
                client.emit('kick', { message: `Protocol error: ${message}` })
            } else {
                reject(error instanceof Error ? error : new Error(String(error)))
            }

            client.disconnect('Protocol error')
        })

        client.once('close', () => {
            logger.debug(`[connectToRealm] Client closed for realm ${realmId}`)
            activeConnections.delete(key)
            unregisterRelaysForClient(client)
        })
    })
}

function getActiveConnectionsForUser(discordId) {
    const results = []

    for (const [key, client] of activeConnections) {
        const [ownerId, realmId] = key.split(':')
        if (ownerId === discordId) results.push({ realmId, client })
    }

    return results
}

function disconnectFromRealm(discordId, realmId, reason) {
    const key = connectionKey(discordId, realmId)
    const client = activeConnections.get(key)

    if (!client) return false

    client.disconnect(reason)
    activeConnections.delete(key)
    unregisterRelaysForClient(client)

    return true
}

function disconnectAllForUser(discordId) {
    for (const [key, client] of activeConnections) {
        if (key.startsWith(`${discordId}:`)) {
            client.disconnect('Shutting down')
            activeConnections.delete(key)
            unregisterRelaysForClient(client)
        }
    }
}

function disconnectAll() {
    for (const [key, client] of activeConnections) {
        client.disconnect('Shutting down')
        activeConnections.delete(key)
        unregisterRelaysForClient(client)
    }
}

module.exports = {
    connectToRealm,
    disconnectFromRealm,
    disconnectAllForUser,
    disconnectAll,
    hasActiveConnection,
    getActiveConnection,
    getActiveConnectionsForUser
}
