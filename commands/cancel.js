const { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js')
const { disconnectAllForUser, getActiveConnectionsForUser } = require('../stuff/bedrockx/index')
const { successContainer, errorContainer, ComponentsV2Flags } = require('../stuff/utils/containers')

const executeJobs = global.__executeActiveJobs || (global.__executeActiveJobs = new Map())
const crashJobs = global.__crashActiveJobs || (global.__crashActiveJobs = new Map())
const playerlistJobs = global.__playerlistActiveJobs || (global.__playerlistActiveJobs = new Map())

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cancel')
        .setDescription('Cancel active Realm connections')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addStringOption((option) =>
            option
                .setName('type')
                .setDescription('What to cancel')
                .setRequired(false)
                .addChoices(
                    { name: 'All', value: 'all' },
                    { name: 'Connections', value: 'connections' },
                    { name: 'Execute', value: 'execute' },
                    { name: 'Crash', value: 'crash' },
                    { name: 'Playerlist', value: 'playerlist' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply()

        const userId = interaction.user.id
        const type = interaction.options.getString('type') || 'all'
        const connections = getActiveConnectionsForUser(userId)
        const executeJob = executeJobs.get(userId)
        const crashJobsList = crashJobs.get(userId) || []
        const playerlistJob = playerlistJobs.get(userId)

        const parts = []

        if (type === 'all' || type === 'connections') {
            if (connections.length > 0) {
                disconnectAllForUser(userId)
                const list = connections.map((c) => `\`${c.realmId}\``).join(', ')
                parts.push(`Disconnected from ${connections.length === 1 ? 'Realm' : 'Realms'} ${list}`)
            }
        }

        if (type === 'all' || type === 'execute') {
            if (executeJob) {
                executeJob.cancel()
                parts.push('Cancelled active execute loop')
            }
        }

        if (type === 'all' || type === 'crash') {
            if (crashJobsList.length > 0) {
                crashJobsList.forEach(job => job.cancel())
                parts.push(`Cancelled ${crashJobsList.length} active crash loop(s)`)
            }
        }

        if (type === 'all' || type === 'playerlist') {
            // Get all playerlist jobs for this user
            const userPlayerlistJobs = []
            for (const [jobId, job] of playerlistJobs.entries()) {
                if (job.userId === userId) {
                    userPlayerlistJobs.push(job)
                }
            }
            
            if (userPlayerlistJobs.length > 0) {
                userPlayerlistJobs.forEach(job => job.cancel())
                parts.push(`Cancelled ${userPlayerlistJobs.length} active player list(s)`)
            }
        }

        if (parts.length === 0) {
            const nothingMessage = type === 'all'
                ? "You don't have any active Realm connections."
                : `You don't have any active ${type}.`
            await interaction.editReply({ components: [errorContainer('Nothing to cancel', nothingMessage)], flags: ComponentsV2Flags })
            return
        }

        await interaction.editReply({ components: [successContainer('Cancelled', parts.join('\n'))], flags: ComponentsV2Flags })
    }
}
