const { Client, GatewayIntentBits, Partials } = require('discord.js')
const { connectDatabase, disconnectDatabase } = require('./database/mongodb')
const { syncWhitelist } = require('./database/models/whitelist')
const { refreshPremiumCache } = require('./database/models/premium')
const { watchWhitelistFile, loadWhitelistFile } = require('./stuff/utils/whitelistWatcher')
const { loadCommands } = require('./handlers/commandhandler')
const { loadEvents } = require('./handlers/eventhandler')
const { deployCommands } = require('./handlers/deployhandler')
const { disconnectAll } = require('./stuff/bedrockx/index')
const { startChannelPurger, stopChannelPurger } = require('./stuff/utils/channelPurger')
const { startTokenRefresh, stopTokenRefresh } = require('./stuff/services/tokenRefresh')
const logger = require('./stuff/utils/logger')
const fs = require('fs')
const path = require('path')
const http = require('http')

// Simple HTTP server for Render port requirement
const PORT = process.env.PORT || 3000
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Realm Tracker Bot is running')
})

server.listen(PORT, () => {
    logger.info(`HTTP server listening on port ${PORT}`)
})

// Try to load config.json if it exists (for local development)
let config = {}
try {
    const configPath = path.join(__dirname, 'config.json')
    if (fs.existsSync(configPath)) {
        config = require(configPath)
    }
} catch (err) {
    logger.warn('config.json not found, using environment variables only')
}

// Use environment variables if available, otherwise fallback to config.json
const envConfig = {
    token: process.env.DISCORD_TOKEN || config.token,
    applicationId: process.env.APPLICATION_ID || config.applicationId,
    clientId: process.env.CLIENT_ID || config.clientId,
    mongodbUri: process.env.MONGODB_URI || config.mongodbUri,
    logChannelId: process.env.LOG_CHANNEL_ID || config.logChannelId,
    purgeChannelIds: process.env.PURGE_CHANNEL_IDS ? JSON.parse(process.env.PURGE_CHANNEL_IDS) : (config.purgeChannelIds || [])
}

function getPurgeChannelIds() {
    try {
        return Array.isArray(envConfig.purgeChannelIds) ? envConfig.purgeChannelIds : []
    } catch (err) {
        logger.error(`Failed to read purgeChannelIds: ${err.message}`)
        return []
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
})

async function main() {
    logger.info('[DEBUG] Starting main function')
    
    await connectDatabase(envConfig.mongodbUri)
    logger.info('[DEBUG] Database connected')

    const whitelisted = await syncWhitelist(loadWhitelistFile())
    logger.info(`Synced ${whitelisted} whitelisted realm id(s) to MongoDB`)

    const premiumCount = await refreshPremiumCache()
    logger.info(`Loaded ${premiumCount} premium user(s)`)

    watchWhitelistFile(async (ids) => {
        const count = await syncWhitelist(ids)
        logger.info(`Whitelist file changed, synced ${count} realm id(s) to MongoDB`)
    })

    logger.info('[DEBUG] Loading commands')
    loadCommands(client)
    logger.info('[DEBUG] Commands loaded')
    
    logger.info('[DEBUG] Loading events')
    loadEvents(client)
    logger.info('[DEBUG] Events loaded')

    try {
        logger.info('[DEBUG] Deploying commands')
        const count = await deployCommands(envConfig)
        logger.info(`Deployed ${count} slash commands`)
    } catch (error) {
        logger.error(`Failed to deploy commands on startup: ${error.message}`)
        logger.error(`Error stack: ${error.stack}`)
    }

    logger.info('[DEBUG] Logging in with Discord token')
    await client.login(envConfig.token)
    logger.info('[DEBUG] Discord login successful')

    // Set bot status to do not disturb with activity
    client.user.setPresence({
        status: 'dnd',
        activities: [{
            name: 'realm tracker https://discord.gg/Pet2YJA3SE',
            type: 0 // 0 = Playing
        }]
    })

    startChannelPurger(client, getPurgeChannelIds)
    startTokenRefresh(client)
}

async function shutdown(signal) {
    logger.info(`Received ${signal}, shutting down`)

    stopChannelPurger()
    stopTokenRefresh()
    disconnectAll()
    await disconnectDatabase()
    client.destroy()

    process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

main().catch((error) => {
    logger.error(`Failed to start Mr Weary: ${error.message}`)
    process.exit(1)
})
