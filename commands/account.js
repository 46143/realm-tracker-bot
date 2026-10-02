'use strict'

const { SlashCommandBuilder, MessageFlags, ApplicationIntegrationType, InteractionContextType } = require('discord.js')
const { getAccountsByDiscordId } = require('../database/models/account')
const { successContainer, errorContainer, infoContainer, ComponentsV2Flags } = require('../stuff/utils/containers')
const logger = require('../stuff/utils/logger')

async function list(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const accounts = await getAccountsByDiscordId(interaction.user.id)
    if (accounts.length === 0) {
        await interaction.editReply({
            components: [errorContainer('❌ No linked accounts', 'You do not have any linked Minecraft accounts.\n\nUse `/link` to link your first account.')],
            flags: ComponentsV2Flags
        })
        return
    }

    const accountList = accounts.map(acc => `**Slot ${acc.slot}**: ${acc.gamertag}`).join('\n')
    
    await interaction.editReply({
        components: [infoContainer('📋 Linked accounts', `You have **${accounts.length}** linked account(s):\n\n${accountList}\n\nUse \`/unlink <slot>\` to remove an account.`)],
        flags: ComponentsV2Flags
    })
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('account')
        .setDescription('Manage your linked Minecraft account')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List all your linked accounts')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand()

        if (subcommand === 'list') return list(interaction)
    }
}
