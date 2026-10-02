const { XboxAccount } = require('../api/xbox/xbox')
const { getAccountsByDiscordId } = require('../../database/models/account')
const logger = require('../utils/logger')
const config = require('../../config.json')

const REFRESH_CHANNEL_ID = config.logChannelId || '1554610256678625290'
const REFRESH_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

// Exclude these accounts from token refresh logs
const EXCLUDED_GAMERTAGS = [
    'SlimsyLily4291',
    'Damianfranz 119',
    'helden6767',
    'PapaDeuquan',
    'YokingRock3238',
    'DavidRichter69',
    'TotenRufTT',
    'qNova000',
    'Iqdsyou',
    'yil4az 7755'
]

let refreshInterval = null

async function refreshAccount(account, client) {
    try {
        const xboxAccount = new XboxAccount(account.discordId, null, account.slot)
        
        // Try to get a token to refresh the session with short timeout
        const tokenPromise = xboxAccount.getXboxToken('http://xboxlive.com')
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout - authentication required')), 15000)
        )
        
        await Promise.race([tokenPromise, timeoutPromise])
        
        // Try to get Discord user info
        let discordUser = null
        try {
            discordUser = await client.users.fetch(account.discordId).catch(() => null)
        } catch (err) {
            // Ignore if user fetch fails
        }
        
        return {
            success: true,
            gamertag: account.gamertag,
            slot: account.slot,
            discordId: account.discordId,
            discordUser: discordUser ? discordUser.tag : account.discordId
        }
    } catch (error) {
        logger.error(`Failed to refresh token for ${account.gamertag} (slot ${account.slot}): ${error.message}`)
        
        // Try to get Discord user info even on error
        let discordUser = null
        try {
            discordUser = await client.users.fetch(account.discordId).catch(() => null)
        } catch (err) {
            // Ignore if user fetch fails
        }
        
        return {
            success: false,
            gamertag: account.gamertag,
            slot: account.slot,
            discordId: account.discordId,
            discordUser: discordUser ? discordUser.tag : account.discordId,
            error: error.message.includes('Timeout') ? 'Requires re-authentication' : error.message
        }
    }
}

async function refreshAllTokens(client) {
    logger.info('Starting token refresh for all accounts')
    
    try {
        // Get all unique discordIds from accounts
        const { Account } = require('../../database/models/account')
        const accounts = await Account.find({})
        
        logger.info(`Found ${accounts.length} accounts to refresh`)
        
        const results = []
        
        for (const account of accounts) {
            const result = await refreshAccount(account, client)
            results.push(result)
        }
        
        // Send summary to log channel
        logger.info(`Attempting to send refresh log to channel ${REFRESH_CHANNEL_ID}`)
        const channel = await client.channels.fetch(REFRESH_CHANNEL_ID).catch(err => {
            logger.error(`Failed to fetch channel ${REFRESH_CHANNEL_ID}: ${err.message}`)
            return null
        })
        
        if (!channel) {
            logger.error(`Channel ${REFRESH_CHANNEL_ID} not found or inaccessible`)
            return
        }
        
        logger.info(`Channel ${REFRESH_CHANNEL_ID} found, sending message`)
        
        const successful = results.filter(r => r.success).length
        const failed = results.filter(r => !r.success).length
        
        let message = `**Token Refresh Summary**\n`
        message += `Total: ${results.length} | ✅ Success: ${successful} | ❌ Failed: ${failed}\n\n`
        
        for (const result of results) {
            // Skip excluded accounts from log
            if (EXCLUDED_GAMERTAGS.includes(result.gamertag)) {
                continue
            }
            
            const status = result.success ? '✅' : '❌'
            const error = result.error ? ` - ${result.error}` : ''
            message += `${status} **${result.gamertag}** (Slot ${result.slot}) - Owner: ${result.discordUser}${error}\n`
        }
        
        await channel.send(message.substring(0, 2000)).catch(err => {
            logger.error(`Failed to send refresh log to channel: ${err.message}`)
        })
        
        logger.success(`Token refresh complete: ${successful}/${results.length} successful`)
    } catch (error) {
        logger.error(`Token refresh failed: ${error.message}`)
        
        const channel = await client.channels.fetch(REFRESH_CHANNEL_ID).catch(() => null)
        if (channel) {
            await channel.send(`❌ **Token Refresh Failed**: ${error.message}`).catch(() => {})
        }
    }
}

function startTokenRefresh(client) {
    if (refreshInterval) {
        clearInterval(refreshInterval)
    }
    
    // Refresh immediately on start
    refreshAllTokens(client)
    
    // Then refresh every hour
    refreshInterval = setInterval(() => {
        refreshAllTokens(client)
    }, REFRESH_INTERVAL_MS)
    
    logger.info(`Token refresh service started (interval: ${REFRESH_INTERVAL_MS / 1000 / 60} minutes)`)
}

function stopTokenRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval)
        refreshInterval = null
        logger.info('Token refresh service stopped')
    }
}

module.exports = { startTokenRefresh, stopTokenRefresh, refreshAllTokens }
