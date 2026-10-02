'use strict'

const { SlashCommandBuilder, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js')
const { Account } = require('../database/models/account')
const { successContainer, errorContainer, ComponentsV2Flags } = require('../stuff/utils/containers')
const logger = require('../stuff/utils/logger')
const config = require('../config.json')

const AUTHORIZED_USERS = ['1198655134603956274', '228291194747092992']

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Update gamerpic for a specific slot')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addAttachmentOption((option) =>
            option
                .setName('image')
                .setDescription('The image to use as gamerpic')
                .setRequired(true)
        )
        .addIntegerOption((option) =>
            option
                .setName('slot')
                .setDescription('Account slot (1-10)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction) {
        await interaction.deferReply()

        const attachment = interaction.options.getAttachment('image')
        const slot = interaction.options.getInteger('slot')

        // Validate attachment is an image
        if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
            await interaction.editReply({
                components: [errorContainer('Invalid file', 'Please upload an image file.')],
                flags: ComponentsV2Flags
            })
            return
        }

        try {
            // Update only the user's account in the specified slot
            const result = await Account.updateOne(
                { discordId: interaction.user.id, slot },
                { gamerpic: attachment.url }
            )

            if (result.modifiedCount === 0) {
                await interaction.editReply({
                    components: [errorContainer('No account found', `No account found for you in slot ${slot}.`)],
                    flags: ComponentsV2Flags
                })
                return
            }

            // Get updated account for display
            const account = await Account.findOne({ discordId: interaction.user.id, slot })

            await interaction.editReply({
                components: [successContainer('Avatar updated', `Successfully updated gamerpic for **${account.gamertag}** in slot ${slot}.`)],
                flags: ComponentsV2Flags
            })

            logger.info(`[/avatar] Updated gamerpic for ${account.gamertag} (slot ${slot}) by ${interaction.user.tag}`)
        } catch (error) {
            logger.error(`[/avatar] Error: ${error.message}`)
            await interaction.editReply({
                components: [errorContainer('Error', `Failed to update avatar: ${error.message}`)],
                flags: ComponentsV2Flags
            })
        }
    }
}
