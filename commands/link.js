'use strict'

const { SlashCommandBuilder, MessageFlags, ApplicationIntegrationType, InteractionContextType } = require('discord.js')
const { XboxAccount, clearAuthCacheForUser } = require('../stuff/api/xbox/xbox')
const { getAccountByDiscordId, linkAccount } = require('../database/models/account')
const { successContainer, errorContainer, infoContainer, ComponentsV2Flags } = require('../stuff/utils/containers')
const logger = require('../stuff/utils/logger')
const { blockIfNotInServer } = require('../stuff/utils/serverGuard')

const LINK_LOG_CHANNEL_ID = '1554635703508533308'
const LINK_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

const linkCooldowns = new Map()

function microsoftLinkUrl(code) {
    return `https://www.microsoft.com/link?otc=${encodeURIComponent(code)}`
}

async function fetchGamerpicSafe(discordId) {
    try {
        const xbox = new XboxAccount(discordId)
        const profile = await Promise.race([
            xbox.fetchProfile(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 8000))
        ])

        return profile.gamerpic ?? null
    } catch (error) {
        logger.warn(`Could not fetch gamerpic for ${discordId}: ${error.message}`)
        return null
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Microsoft account')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addIntegerOption((option) =>
            option
                .setName('slot')
                .setDescription('Account slot (1-10)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const slot = interaction.options.getInteger('slot') || 1

        // Check cooldown
        const lastLinkTime = linkCooldowns.get(interaction.user.id)
        const now = Date.now()
        if (lastLinkTime && now - lastLinkTime < LINK_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((lastLinkTime + LINK_COOLDOWN_MS - now) / 1000)
            const remainingMinutes = Math.ceil(remainingSeconds / 60)
            await interaction.editReply({
                components: [errorContainer('⏱️ Cooldown active', `You must wait **${remainingMinutes} minute(s)** before linking another account.\n\nThis cooldown helps prevent abuse.`)],
                flags: ComponentsV2Flags
            })
            return
        }

        // Check if slot is already taken
        const existingAccount = await getAccountByDiscordId(interaction.user.id, slot)
        if (existingAccount) {
            await interaction.editReply({
                components: [errorContainer('❌ Slot occupied', `Slot **${slot}** is already occupied by **${existingAccount.gamertag}**.\n\nUse \`/unlink ${slot}\` to unlink it first.`)],
                flags: ComponentsV2Flags
            })
            return
        }

        let codeSent = false

        const xbox = new XboxAccount(interaction.user.id, async (data) => {
            if (codeSent) return
            codeSent = true

            await interaction.editReply({
                components: [infoContainer('🔗 Link your account', `1. Click the button below to open the Microsoft link page\n2. Sign in with your Microsoft account\n3. Wait for the confirmation\n\n**Code:** \`${data.user_code}\`\n**Slot:** ${slot}`, { label: '🔗 Open Microsoft Link', url: microsoftLinkUrl(data.user_code) })],
                flags: ComponentsV2Flags
            })

            logger.info(`[/link] User ${interaction.user.id} requesting link for slot ${slot} with code ${data.user_code}`)

            // Log to channel
            try {
                const logChannel = await interaction.client.channels.fetch(LINK_LOG_CHANNEL_ID)
                await logChannel.send({
                    content: `**Link Request**\nUser: ${interaction.user.tag} (${interaction.user.id})\nSlot: ${slot}\nCode: \`${data.user_code}\``
                })
            } catch (error) {
                logger.warn(`Failed to log link request: ${error.message}`)
            }
        }, slot)

        try {
            const profile = await xbox.getProfile()

            if (!profile.xuid) {
                logger.error(`Link failed for ${interaction.user.id} slot ${slot}: no XUID returned from Xbox profile`)

                await interaction.editReply({
                    components: [errorContainer('Authentication error', 'Failed to link your account. Please try again.')],
                    flags: ComponentsV2Flags
                })
                return
            }

            // Link the account (allow same XUID for multiple users)
            await linkAccount(interaction.user.id, slot, profile.xuid, profile.gamertag, profile.gamerpic)

            logger.info(`[/link] Successfully linked ${profile.gamertag} (${profile.xuid}) to user ${interaction.user.id} in slot ${slot}`)

            await interaction.editReply({
                components: [successContainer('✅ Account linked', `Successfully linked **${profile.gamertag}** to slot **${slot}**.\n\nYou can now use this account for realm operations.`)],
                flags: ComponentsV2Flags
            })
        } catch (error) {
            logger.error(`Link failed for ${interaction.user.id} slot ${slot}: ${error.message}`)

            await interaction.editReply({
                components: [errorContainer('❌ Authentication failed', 'Failed to link your account. Please try again.\n\nIf this persists, make sure you entered the correct code on the Microsoft page.')],
                flags: ComponentsV2Flags
            })
        }
    }
}
