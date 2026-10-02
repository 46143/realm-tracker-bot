'use strict'

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationIntegrationType, InteractionContextType, ComponentType } = require('discord.js')
const { successContainer, errorContainer, infoContainer, ComponentsV2Flags } = require('../stuff/utils/containers')

const COMMAND_CATEGORIES = {
    account: {
        name: '👤 Account Commands',
        description: 'Commands for account management',
        commands: [
            { name: '/link', description: 'Link your Minecraft account' },
            { name: '/unlink', description: 'Unlink your Minecraft account' }
        ]
    },
    tracker: {
        name: '� Tracker Commands',
        description: 'Commands for Realm tracking',
        commands: [
            { name: '/playerlist', description: 'Live player list for a Realm' }
        ]
    },
    utility: {
        name: '🔧 Utility Commands',
        description: 'Various utility commands',
        commands: [
            { name: '/cancel', description: 'Cancel running operations' },
            { name: '/ping', description: 'Check bot latency' }
        ]
    }
}

function buildCategoryButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_account')
            .setLabel('� Account')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('help_tracker')
            .setLabel('📊 Tracker')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('help_utility')
            .setLabel('🔧 Utility')
            .setStyle(ButtonStyle.Secondary)
    )
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('View all available commands')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        await interaction.deferReply()

        await interaction.editReply({
            components: [
                infoContainer('📚 Help Menu', 'Select a category to view commands'),
                buildCategoryButtons()
            ],
            flags: ComponentsV2Flags
        })

        const message = await interaction.fetchReply()

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 5 * 60_000,
            filter: (buttonInteraction) => buttonInteraction.user.id === interaction.user.id
        })

        collector.on('collect', async (buttonInteraction) => {
            const categoryKey = buttonInteraction.customId.replace('help_', '')
            const category = COMMAND_CATEGORIES[categoryKey]

            if (!category) return

            const commandList = category.commands
                .map(cmd => `**${cmd.name}**\n${cmd.description}`)
                .join('\n\n')

            await buttonInteraction.update({
                components: [
                    successContainer(category.name, `${category.description}\n\n${commandList}`),
                    buildCategoryButtons()
                ],
                flags: ComponentsV2Flags
            })
        })

        collector.on('end', async () => {
            await interaction.editReply({
                components: [
                    errorContainer('Command expired', 'This help menu has expired. Run /help again.'),
                    buildCategoryButtons().setComponents(
                        buildCategoryButtons().components.map(btn => btn.setDisabled(true))
                    )
                ],
                flags: ComponentsV2Flags
            }).catch(() => {})
        })
    }
}
