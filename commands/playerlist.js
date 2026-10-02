'use strict'

const { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js')
const { XboxAccount } = require('../stuff/api/xbox/xbox')
const { RealmAPI } = require('../stuff/api/realm/realm')
const { getAccountByDiscordId } = require('../database/models/account')
const { addRealmCode } = require('../database/models/realmCode')
const { isValidRealmCode, isValidRealmId } = require('../stuff/utils/validation')
const { blockIfWhitelisted } = require('../stuff/utils/whitelistGuard')
const { successContainer, errorContainer, infoContainer, ComponentsV2Flags } = require('../stuff/utils/containers')
const logger = require('../stuff/utils/logger')
const path = require('path')

const DEFAULT_UPDATE_INTERVAL_MS = 60_000 // 1 minute

// Anti-ban: Enforce minimum interval of 60 seconds
const MIN_INTERVAL_SECONDS = 60

// Anti-ban: Add random jitter to avoid detection
function getRandomJitter(minMs = 1000, maxMs = 3000) {
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

const activeJobs = global.__playerlistActiveJobs || (global.__playerlistActiveJobs = new Map())
let jobIdCounter = global.__playerlistJobIdCounter || (global.__playerlistJobIdCounter = 0)

function normalizeConnection(raw) {
    if (raw.networkProtocol === 'DEFAULT') {
        const [ip, port] = raw.address.split(':')
        return { transport: 'DEFAULT', ip, port: Number(port) }
    }

    if (raw.networkProtocol === 'NETHERNET' || raw.networkProtocol === 'NETHERNET_JSONRPC') {
        return { transport: raw.networkProtocol, networkId: raw.address }
    }

    throw new Error(`Unrecognized realm connection response (networkProtocol: ${raw.networkProtocol})`)
}

module.exports = {
    activeJobs,

    data: new SlashCommandBuilder()
        .setName('playerlist')
        .setDescription('Live player list for a Realm (updates every minute)')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addStringOption((option) => option
            .setName('destination')
            .setDescription('Realm code or realm id')
            .setRequired(true))
        .addIntegerOption((option) => option
            .setName('duration')
            .setDescription('Duration in minutes (default: 10, 0 = infinite)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(10080))
        .addIntegerOption((option) => option
            .setName('interval')
            .setDescription('Update interval in seconds (default: 60, minimum: 60)')
            .setRequired(false)
            .setMinValue(60)
            .setMaxValue(300))
        .addIntegerOption((option) => option
            .setName('slot')
            .setDescription('Account slot to use (1-10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)),

    async execute(interaction) {
        await interaction.deferReply()

        const destination = interaction.options.getString('destination').trim()
        const durationMinutes = interaction.options.getInteger('duration') || 10
        const intervalSeconds = Math.max(MIN_INTERVAL_SECONDS, interaction.options.getInteger('interval') || 60)
        const slot = interaction.options.getInteger('slot') || 1
        const userId = interaction.user.id

        // Generate unique job ID to allow multiple playerlist jobs per user
        const jobId = `${userId}_${++jobIdCounter}`

        const isId = isValidRealmId(destination)
        const isCode = isValidRealmCode(destination)

        if (isId && await blockIfWhitelisted(interaction, destination)) return

        if (!isId && !isCode) {
            await interaction.editReply({
                components: [errorContainer('❌ Invalid destination', 'The value you provided is not a valid Realm code or Realm ID.\n\nPlease provide a valid code (e.g., `ABC123`) or Realm ID.')],
                flags: ComponentsV2Flags
            })
            return
        }

        const linkedAccount = await getAccountByDiscordId(userId, slot)
        if (!linkedAccount) {
            await interaction.editReply({ components: [errorContainer('❌ No linked account', `You need to link your Minecraft account first.\n\nUse \`/account link ${slot}\` to link an account in Slot ${slot}.`)], flags: ComponentsV2Flags })
            return
        }

        const account = new XboxAccount(userId, null, slot)

        let realm
        try {
            const realmApi = new RealmAPI(account)
            await realmApi.init()

            realm = isId
                ? await realmApi.getRealmById(destination)
                : await realmApi.getRealmByCode(destination)

            if (!realm) {
                await interaction.editReply({
                    components: [errorContainer('❌ Realm not found', isId
                        ? 'No Realm was found for the provided ID.\n\nPlease check the ID and try again.'
                        : 'No Realm was found for the provided code.\n\nPlease check the code and try again.')],
                    flags: ComponentsV2Flags
                })
                return
            }

            if (isCode) {
                try {
                    await addRealmCode(destination, String(realm.id), realm.name, userId)
                } catch (error) {
                    logger.error(`[/playerlist] Failed to log realm code: ${error.message}`)
                }
            }

            if (await blockIfWhitelisted(interaction, realm.id)) return
        } catch (error) {
            await interaction.editReply({
                components: [errorContainer('Connection failed', 'Failed to look up the Realm. Please try again.')],
                flags: ComponentsV2Flags
            })
            return
        }

        await interaction.editReply({
            components: [successContainer('Player list started', `Live player list for **${realm.name}** has been started.`)],
            flags: ComponentsV2Flags
        })

        // Delete last 4 messages in the channel
        try {
            const messages = await interaction.channel.messages.fetch({ limit: 4 })
            for (const [_, message] of messages) {
                if (message.deletable) {
                    await message.delete().catch(err => {
                        logger.warn(`[/playerlist] Failed to delete message ${message.id}: ${err.message}`)
                    })
                }
            }
        } catch (err) {
            logger.warn(`[/playerlist] Failed to delete last 4 messages: ${err.message}`)
        }

        // Create webhook for sending container messages
        const deviceEmojis = {
            'PlayStation': '<:playstation:1554588603164663808>',
            'PS4': '<:playstation:1554588603164663808>',
            'PS5': '<:playstation:1554588603164663808>',
            'Xbox': '<:xbox:1554588567295102986>',
            'Switch': '<:switch:1554588944564486225>',
            'Nintendo': '<:switch:1554588944564486225>',
            'Windows': '<:windows:1554588676581752952>',
            'Win32': '<:windows:1554588676581752952>',
            'iOS': '<:ios:1554588839526531142>',
            'iPhone': '<:ios:1554588839526531142>',
            'iPad': '<:ios:1554588839526531142>',
            'Android': '<:android:1554588880202637442>',
            'Web': '<:electricity:1554588969172336760>',
            'Unknown': '<:loading:1554588509438738542>'
        }

        const getDeviceEmoji = (device) => {
            return deviceEmojis[device] || device
        }

        const isSwightPvP = (isCode && destination === 'hjMqtMiKdhidSEA') || (isId && realm.id === '28164125')
        const isWearyPvP = isCode && destination === 'dYg9_EBwhHnZruc'
        
        // Cleanup existing webhooks in the channel to avoid hitting the limit
        try {
            const existingWebhooks = await interaction.channel.fetchWebhooks()
            for (const [_, webhook] of existingWebhooks) {
                if (webhook.owner.id === interaction.client.user.id) {
                    await webhook.delete()
                    logger.info(`[/playerlist] Deleted existing webhook ${webhook.id} in channel`)
                }
            }
        } catch (err) {
            logger.warn(`[/playerlist] Failed to cleanup existing webhooks: ${err.message}`)
        }
        
        const webhook = await interaction.channel.createWebhook({
            name: isSwightPvP ? 'Swight PvP Playerlist' : (isWearyPvP ? 'Weary PvP Playerlist' : 'Player List Bot'),
            avatar: isSwightPvP ? path.join(__dirname, '../swight-pvp.png') : (isWearyPvP ? path.join(__dirname, '../weary-pvp.png') : interaction.client.user.displayAvatarURL())
        })

        // Send message with both header and player list embeds
        const playerListMessage = await webhook.send({
            embeds: [
                {
                    title: `**__${isSwightPvP ? 'Swight PvP' : (isWearyPvP ? 'Weary PvP' : realm.name)}__ Playerlist** <:statistic:1554620594476158986>`,
                    description: `-# <:purple_arrow:1555331385818873929> **Last Update: Loading...** <:update:1555332236440772749>\n-# <:purple_arrow:1555331385818873929> **Next Update: Loading...** <:upgrade:1532427404176523405>`,
                    color: 0xa855f7
                },
                {
                    description: `**__Online Players:__** Loading...`,
                    color: 0x00ff00
                },
                {
                    description: `<:dark_green_arrow:1555341762292350986> **__Total Membercount:__** **Loading...** <:realm_members:1555341807259230269>`,
                    color: 0x5865f2
                }
            ]
        })

        const channelEdit = async (payload) => {
            try {
                await webhook.editMessage(playerListMessage.id, payload)
            } catch (err) {
                logger.warn(`[/playerlist] Channel edit failed for ${userId}: ${err?.message ?? err}`)
            }
        }

        const job = {
            jobId,
            userId,
            cancelled: false,
            cancel() {
                this.cancelled = true
            }
        }

        activeJobs.set(jobId, job)

        const isInfinite = durationMinutes === 0
        const endTime = isInfinite ? Infinity : Date.now() + (durationMinutes * 60 * 1000)
        const updateIntervalMs = intervalSeconds * 1000
        const updateCount = isInfinite ? Infinity : Math.ceil((durationMinutes * 60 * 1000) / updateIntervalMs)

        try {
            let i = 0
            while (i < updateCount) {
                if (job.cancelled) break

                const remainingMinutes = isInfinite ? Infinity : Math.ceil((endTime - Date.now()) / 60_000)
                const timeLeft = isInfinite ? ' (∞)' : (remainingMinutes > 0 ? ` (${remainingMinutes}min left)` : '')

                try {
                    const realmApi = new RealmAPI(account)
                    await realmApi.init()

                    const currentRealm = isId
                        ? await realmApi.getRealmById(destination)
                        : await realmApi.getRealmByCode(destination)

                    if (!currentRealm) {
                        await channelEdit({
                            components: [errorContainer('Realm not found', 'Could not fetch realm data.')],
                            flags: ComponentsV2Flags
                        })
                        break
                    }

                    const invitedPlayers = Array.isArray(currentRealm.players) ? currentRealm.players : []
                    const onlinePlayers = invitedPlayers.filter((player) => player.online)
                    const maxPlayers = currentRealm.maxPlayers ?? onlinePlayers.length
                    const memberCount = invitedPlayers.length
                    const onlineXuids = onlinePlayers.map((player) => player.uuid)

                    const [profilesByXuid, devicesByXuid] = onlineXuids.length
                        ? await Promise.all([
                            account.fetchProfilesByXuids(onlineXuids),
                            account.fetchPresenceByXuids(onlineXuids)
                        ])
                        : [new Map(), new Map()]

                    const entries = onlinePlayers.map((player) => {
                        const profile = profilesByXuid.get(player.uuid)
                        const device = devicesByXuid.get(player.uuid) || 'Unknown'

                        return {
                            gamertag: profile?.gamertag || player.name || 'Unknown',
                            gamerpic: profile?.gamerpic ?? null,
                            xuid: player.uuid,
                            device: device
                        }
                    })

                    const summary = `**__Online Players:__ ${onlinePlayers.length}/${maxPlayers}**`
                    const lastUpdate = Math.floor(Date.now() / 1000) // Unix timestamp for Discord timestamp
                    const nextUpdate = Math.floor((Date.now() + (intervalSeconds * 1000)) / 1000) // Next update timestamp

                    if (!entries.length) {
                        await channelEdit({
                            embeds: [
                                {
                                    title: `**__${isSwightPvP ? 'Swight PvP' : (isWearyPvP ? 'Weary PvP' : realm.name)}__ Playerlist** <:statistic:1554620594476158986>`,
                                    description: `-# <:purple_arrow:1555331385818873929> **Last Update: <t:${lastUpdate}:R>** <:update:1555332236440772749>\n-# <:purple_arrow:1555331385818873929> **Next Update: <t:${nextUpdate}:R>** <:upgrade:1532427404176523405>`,
                                    color: 0xa855f7
                                },
                                {
                                    description: `${summary}\n\nNo players are currently online.`,
                                    color: 0x00ff00
                                },
                                {
                                    description: `<:dark_green_arrow:1555341762292350986> **__Total Membercount:__** **${memberCount.toLocaleString()}** <:realm_members:1555341807259230269>`,
                                    color: 0x5865f2
                                }
                            ]
                        })
                    } else {
                        const playerList = entries.map(entry => `<:arrow:1554620529955045396> **${entry.gamertag}** ${getDeviceEmoji(entry.device)}`).join('\n')
                        await channelEdit({
                            embeds: [
                                {
                                    title: `**__${isSwightPvP ? 'Swight PvP' : (isWearyPvP ? 'Weary PvP' : realm.name)}__ Playerlist** <:statistic:1554620594476158986>`,
                                    description: `-# <:purple_arrow:1555331385818873929> **Last Update: <t:${lastUpdate}:R>** <:update:1555332236440772749>\n-# <:purple_arrow:1555331385818873929> **Next Update: <t:${nextUpdate}:R>** <:upgrade:1532427404176523405>`,
                                    color: 0xa855f7
                                },
                                {
                                    description: `${summary}\n\n${playerList}`,
                                    color: 0x00ff00
                                },
                                {
                                    description: `<:dark_green_arrow:1555341762292350986> **__Total Membercount:__** **${memberCount.toLocaleString()}** <:realm_members:1555341807259230269>`,
                                    color: 0x5865f2
                                }
                            ]
                        })
                    }

                    logger.info(`[/playerlist] Update ${i + 1}${isInfinite ? '' : '/' + updateCount} sent for ${realm.name} - ${onlinePlayers.length} players online${timeLeft}`)
                } catch (err) {
                    logger.error(`[/playerlist] Update ${i + 1}${isInfinite ? '' : '/' + updateCount} failed for ${realm.name}: ${err.message}`)
                    await channelEdit({
                        embeds: [
                            {
                                title: `**__${isSwightPvP ? 'Swight PvP' : (isWearyPvP ? 'Weary PvP' : realm.name)}__ Playerlist** <:statistic:1554620594476158986>`,
                                description: `-# <:purple_arrow:1555331385818873929> **Last Update: Error** <:update:1555332236440772749>\n-# <:purple_arrow:1555331385818873929> **Next Update: Retrying...** <:upgrade:1532427404176523405>`,
                                color: 0xa855f7
                            },
                            {
                                description: `**__Online Players:__** Error fetching player list.\n\nError: ${err.message}`,
                                color: 0xff0000
                            },
                            {
                                description: `<:dark_green_arrow:1555341762292350986> **__Total Membercount:__** **Error** <:realm_members:1555341807259230269>`,
                                color: 0x5865f2
                            }
                        ]
                    })
                }

                await new Promise(resolve => setTimeout(resolve, updateIntervalMs + getRandomJitter()))
            }
        } catch (err) {
            logger.error(`[/playerlist] Job failed for user ${userId}: ${err.message}`)
        } finally {
            // Always cleanup webhook when job ends (completed or cancelled)
            try {
                await webhook.delete()
                logger.info(`[/playerlist] Webhook deleted for job ${jobId}`)
            } catch (err) {
                logger.warn(`[/playerlist] Failed to delete webhook: ${err.message}`)
            }
            activeJobs.delete(jobId)
        }
    }
}
