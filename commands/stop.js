'use strict'

const { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js')
const { successContainer, errorContainer, ComponentsV2Flags } = require('../stuff/utils/containers')
const logger = require('../stuff/utils/logger')

const { activeJobs } = require('./playerlist')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop all active playerlist jobs')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        await interaction.deferReply()

        const userId = interaction.user.id

        logger.info(`[/stop] User ${userId} attempting to stop all playerlist jobs`)

        let stoppedCount = 0

        for (const [jobId, job] of activeJobs) {
            if (job.userId === userId) {
                job.cancel()
                stoppedCount++
                logger.info(`[/stop] Stopped job ${jobId} for user ${userId}`)
            }
        }

        if (stoppedCount > 0) {
            logger.success(`[/stop] Stopped ${stoppedCount} playerlist job(s) for user ${userId}`)
            await interaction.editReply({
                components: [successContainer('Playerlist stopped', `Successfully stopped ${stoppedCount} active playerlist job(s).`)],
                flags: ComponentsV2Flags
            })
        } else {
            logger.warn(`[/stop] No active playerlist jobs found for user ${userId}`)
            await interaction.editReply({
                components: [errorContainer('No active jobs', 'You have no active playerlist jobs to stop.')],
                flags: ComponentsV2Flags
            })
        }
    }
}
