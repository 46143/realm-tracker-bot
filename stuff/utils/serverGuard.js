const { errorContainer, ComponentsV2Flags } = require('./containers')
const logger = require('./logger')
const { isUserBlacklisted } = require('../../database/models/blacklist')

const REQUIRED_SERVER_ID = '1553740293105520710'
const INVITE_LINK = 'https://discord.gg/7JPHYu9Fcv'

/**
 * Check if the user is a member of the required server
 * @param {import('discord.js').GuildMember} member - The guild member to check
 * @returns {boolean} - True if the user is a member of the required server
 */
function isMemberOfRequiredServer(member) {
    if (!member || !member.guild) return false
    logger.debug(`[serverGuard] Checking guild ID: ${member.guild.id} against required: ${REQUIRED_SERVER_ID}`)
    return member.guild.id === REQUIRED_SERVER_ID
}

/**
 * Block interaction if user is not a member of the required server
 * @param {import('discord.js').BaseInteraction} interaction - The interaction to check
 * @returns {Promise<boolean>} - True if blocked (user is not a member), false if not blocked
 */
async function blockIfNotInServer(interaction) {
    logger.debug(`[serverGuard] Checking server membership for user ${interaction.user.id}`)
    
    // Check if user is blacklisted first
    if (isUserBlacklisted(interaction.user.id)) {
        logger.warn(`[serverGuard] User ${interaction.user.id} is blacklisted`)
        const errorMessage = `You have been blacklisted from using this bot.`
        if (interaction.deferred) {
            await interaction.editReply({ components: [errorContainer('❌ Blacklisted', errorMessage)], flags: ComponentsV2Flags })
        } else {
            await interaction.reply({ components: [errorContainer('❌ Blacklisted', errorMessage)], flags: ComponentsV2Flags, ephemeral: true })
        }
        return true
    }
    
    // Check if user is in the required server (works for both DMs and server commands)
    let isInRequiredServer = false
    
    if (interaction.member && interaction.guild) {
        // Command used in a server
        isInRequiredServer = isMemberOfRequiredServer(interaction.member)
        logger.debug(`[serverGuard] User in guild ${interaction.guild.id}, is required: ${isInRequiredServer}`)
    } else {
        // Command used in DMs - check if user is member of required server via API
        try {
            const guild = await interaction.client.guilds.fetch(REQUIRED_SERVER_ID)
            const member = await guild.members.fetch(interaction.user.id).catch(() => null)
            isInRequiredServer = member !== null
            logger.debug(`[serverGuard] User checked via API in DMs, is in required server: ${isInRequiredServer}`)
        } catch (error) {
            logger.error(`[serverGuard] Failed to check server membership via API: ${error.message}`)
            isInRequiredServer = false
        }
    }
    
    if (!isInRequiredServer) {
        logger.warn(`[serverGuard] User ${interaction.user.id} not in required server ${REQUIRED_SERVER_ID}`)
        const errorMessage = `You have to be in the required server to use this command.\n\nJoin here: ${INVITE_LINK}`
        if (interaction.deferred) {
            await interaction.editReply({ components: [errorContainer('❌ Access Denied', errorMessage)], flags: ComponentsV2Flags })
        } else {
            await interaction.reply({ components: [errorContainer('❌ Access Denied', errorMessage)], flags: ComponentsV2Flags, ephemeral: true })
        }
        return true
    }

    logger.debug(`[serverGuard] User ${interaction.user.id} allowed`)
    return false
}

module.exports = {
    isMemberOfRequiredServer,
    blockIfNotInServer,
    REQUIRED_SERVER_ID,
    INVITE_LINK
}
