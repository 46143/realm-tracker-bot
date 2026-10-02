'use strict'

const { SlashCommandBuilder, MessageFlags, ApplicationIntegrationType, InteractionContextType } = require('discord.js')
const { XboxAccount, clearAuthCacheForUser } = require('../stuff/api/xbox/xbox')
const { getAccountByDiscordId, getAccountsByDiscordId, unlinkAccount } = require('../database/models/account')
const { disconnectAllForUser } = require('../stuff/bedrockx/index')
const { successContainer, errorContainer, infoContainer, ComponentsV2Flags } = require('../stuff/utils/containers')
const logger = require('../stuff/utils/logger')
const { blockIfNotInServer } = require('../stuff/utils/serverGuard')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Unlink your Microsoft account')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addIntegerOption((option) =>
            option
                .setName('slot')
                .setDescription('Account slot to unlink (leave empty to unlink all)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const slot = interaction.options.getInteger('slot')

        if (slot) {
            // Unlink specific slot
            const account = await getAccountByDiscordId(interaction.user.id, slot)
            if (!account) {
                await interaction.editReply({
                    components: [errorContainer('❌ Slot empty', `Slot **${slot}** is not linked to any account.\n\nUse \`/account list\` to see your linked accounts.`)],
                    flags: ComponentsV2Flags
                })
                return
            }

            disconnectAllForUser(interaction.user.id)

            await unlinkAccount(interaction.user.id, slot)

            try {
                await clearAuthCacheForUser(interaction.user.id)
            } catch (error) {
                logger.warn(`Failed to clear auth cache for ${interaction.user.id}: ${error.message}`)
            }

            logger.info(`[/unlink] User ${interaction.user.id} unlinked account from slot ${slot}`)

            await interaction.editReply({
                components: [successContainer('✅ Account unlinked', `Successfully unlinked **${account.gamertag}** from slot **${slot}**.\n\nAll active connections for this account have been closed.`)],
                flags: ComponentsV2Flags
            })
        } else {
            // Unlink all accounts
            const accounts = await getAccountsByDiscordId(interaction.user.id)
            if (accounts.length === 0) {
                await interaction.editReply({
                    components: [errorContainer('❌ No linked accounts', 'You do not have any linked Minecraft accounts.\n\nUse `/link` to link your first account.')],
                    flags: ComponentsV2Flags
                })
                return
            }

            disconnectAllForUser(interaction.user.id)

            await unlinkAccount(interaction.user.id)

            try {
                await clearAuthCacheForUser(interaction.user.id)
            } catch (error) {
                logger.warn(`Failed to clear auth cache for ${interaction.user.id}: ${error.message}`)
            }

            await interaction.editReply({
                components: [successContainer('✅ All accounts unlinked', `Successfully unlinked **${accounts.length}** account(s).\n\nAll your accounts have been removed and all active connections have been closed.`)],
                flags: ComponentsV2Flags
            })
        }
    }
}
