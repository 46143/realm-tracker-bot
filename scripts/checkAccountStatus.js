const { XboxAccount } = require('../stuff/api/xbox/xbox')
const { getAccountByDiscordId, getAccountsByDiscordId } = require('../database/models/account')
const logger = require('../stuff/utils/logger')
const mongoose = require('mongoose')

async function checkAccountStatus() {
    const discordId = '228291194747092992'

    // Connect to MongoDB
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zepher')
        logger.info('Connected to MongoDB')
    } catch (error) {
        logger.error(`Failed to connect to MongoDB: ${error.message}`)
        process.exit(1)
    }

    logger.info(`Checking all accounts for Discord ID ${discordId}`)

    try {
        const accounts = await getAccountsByDiscordId(discordId)
        
        if (!accounts || accounts.length === 0) {
            logger.error(`No accounts found for this Discord ID`)
            await mongoose.disconnect()
            process.exit(0)
        }

        logger.info(`Found ${accounts.length} account(s):`)
        
        for (const account of accounts) {
            logger.info(`- Slot ${account.slot}: ${account.gamertag} (XUID: ${account.xuid})`)
        }

        // Check each account
        for (const account of accounts) {
            logger.info(`\n--- Checking Slot ${account.slot}: ${account.gamertag} ---`)

            const xbox = new XboxAccount(discordId, null, account.slot)

            logger.info('Attempting to fetch profile...')
            try {
                const profile = await xbox.fetchProfile()
                logger.success(`Profile fetch successful: ${profile.gamertag}`)
                logger.info(`Profile data: ${JSON.stringify(profile, null, 2)}`)
            } catch (profileError) {
                logger.error(`Profile fetch failed: ${profileError.message}`)
                logger.error(`Error details: ${JSON.stringify(profileError, null, 2)}`)
            }

            logger.info('Attempting to get gamertag...')
            try {
                const gamertag = await xbox.fetchGamertag()
                logger.success(`Gamertag fetch successful: ${gamertag}`)
            } catch (gamertagError) {
                logger.error(`Gamertag fetch failed: ${gamertagError.message}`)
                logger.error(`Error details: ${JSON.stringify(gamertagError, null, 2)}`)
            }
        }

        logger.info('\nAccount status check complete')

    } catch (error) {
        logger.error(`Error checking account status: ${error.message}`)
        logger.error(`Error stack: ${error.stack}`)
    }

    await mongoose.disconnect()
    process.exit(0)
}

checkAccountStatus()
