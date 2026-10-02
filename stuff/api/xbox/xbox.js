const { Authflow, Titles } = require('prismarine-auth')
const { getAuthCacheEntry, setAuthCacheEntry, deleteAuthCacheForUser } = require('../../../database/models/authCache')
const { resilientFetch } = require('../../utils/resilientFetch')
const logger = require('../../utils/logger')

function mongoCacheFactory({ username, cacheName }) {
    return {
        async getCached() {
            const entry = await getAuthCacheEntry(username, cacheName)
            return entry?.data ?? {}
        },
        async setCached(value) {
            await setAuthCacheEntry(username, cacheName, value)
        },
        async setCachedPartial(value) {
            const entry = await getAuthCacheEntry(username, cacheName)
            await setAuthCacheEntry(username, cacheName, { ...(entry?.data ?? {}), ...value })
        },
        async reset() {
            await setAuthCacheEntry(username, cacheName, {})
        }
    }
}

const DEVICE_TYPE_LABELS = {
    Win32: 'Windows',
    WindowsOneCore: 'Windows',
    XboxOne: 'Xbox',
    Scarlett: 'Xbox',
    Durango: 'Xbox',
    iOS: 'iOS',
    Android: 'Android',
    Nintendo: 'Switch'
}

function formatDeviceType(type) {
    if (!type) return 'Unknown'
    return DEVICE_TYPE_LABELS[type] || type
}

function createDeviceProfile() {
    return {
        authTitle: '0000000048183522',
        deviceType: 'iOS',
        deviceModel: 'iPhone14,5',
        deviceOS: 5,
        UIProfile: 0,
        maxViewDistance: 12,
        memoryTier: 3,
        platformType: 0
    }
}

class XboxAccount {
    constructor(discordId, onMsaCode, slot = 1) {
        this.discordId = discordId
        this.slot = slot

        // Use discordId_slot as username for slot-specific caching
        const username = `${discordId}_slot${slot}`
        
        this.authflow = new Authflow(username, mongoCacheFactory, {
            flow: 'sisu',
            authTitle: Titles.MinecraftIOS,
            deviceType: 'iOS'
        }, onMsaCode)
    }

    async getXboxToken(relyingParty = 'https://multiplayer.minecraft.net/') {
        const token = await this.authflow.getXboxToken(relyingParty)

        if (token?.userXUID) this.xuid = token.userXUID

        return `XBL3.0 x=${token.userHash};${token.XSTSToken}`
    }

    async fetchProfile() {
        const authHeader = await this.getXboxToken('http://xboxlive.com')

        const response = await resilientFetch('https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,GameDisplayPicRaw', {
            headers: {
                'x-xbl-contract-version': '2',
                Authorization: authHeader
            }
        })

        if (!response.ok) {
            throw new Error(`Failed to fetch Xbox profile, status ${response.status}`)
        }

        const data = await response.json()
        const settings = data?.profileUsers?.[0]?.settings ?? []
        const gamertag = settings.find((setting) => setting.id === 'Gamertag')?.value
        const rawPic = settings.find((setting) => setting.id === 'GameDisplayPicRaw')?.value
        const gamerpic = rawPic ? rawPic.replace(/^http:/, 'https:') : null

        return { gamertag, gamerpic }
    }

    async fetchGamertag() {
        const { gamertag } = await this.fetchProfile()

        return gamertag
    }

    async fetchProfilesByXuids(xuids) {
        if (!Array.isArray(xuids) || !xuids.length) return new Map()

        const token = await this.authflow.getXboxToken('http://xboxlive.com')
        const authHeader = `XBL3.0 x=${token.userHash};${token.XSTSToken}`

        const profilesByXuid = new Map()

        for (let i = 0; i < xuids.length; i += 50) {
            const chunk = xuids.slice(i, i + 50)

            const response = await resilientFetch('https://profile.xboxlive.com/users/batch/profile/settings', {
                method: 'POST',
                headers: {
                    'x-xbl-contract-version': '2',
                    'content-type': 'application/json',
                    Authorization: authHeader
                },
                body: JSON.stringify({ userIds: chunk, settings: ['Gamertag', 'GameDisplayPicRaw'] })
            })

            if (!response.ok) {
                throw new Error(`Failed to fetch Xbox profiles, status ${response.status}`)
            }

            const data = await response.json()
            const profiles = Array.isArray(data?.profileUsers) ? data.profileUsers : []

            for (const profile of profiles) {
                const gamertag = profile.settings?.find((setting) => setting.id === 'Gamertag')?.value
                const rawPic = profile.settings?.find((setting) => setting.id === 'GameDisplayPicRaw')?.value

                if (gamertag) {
                    profilesByXuid.set(profile.id, {
                        gamertag,
                        gamerpic: rawPic ? rawPic.replace(/^http:/, 'https:') : null
                    })
                }
            }
        }

        return profilesByXuid
    }

    async fetchGamertagsByXuids(xuids) {
        const profiles = await this.fetchProfilesByXuids(xuids)

        return new Map([...profiles].map(([xuid, profile]) => [xuid, profile.gamertag]))
    }

    async fetchPresenceByXuids(xuids) {
        if (!Array.isArray(xuids) || !xuids.length) return new Map()

        const token = await this.authflow.getXboxToken('http://xboxlive.com')
        const authHeader = `XBL3.0 x=${token.userHash};${token.XSTSToken}`

        const response = await resilientFetch('https://userpresence.xboxlive.com/users/batch', {
            method: 'POST',
            headers: {
                'x-xbl-contract-version': '3',
                'content-type': 'application/json',
                Accept: 'application/json',
                Authorization: authHeader
            },
            body: JSON.stringify({ users: xuids, level: 'all' })
        })

        if (!response.ok) {
            throw new Error(`Failed to fetch Xbox presence, status ${response.status}`)
        }

        const data = await response.json()
        const records = Array.isArray(data) ? data : []

        const devicesByXuid = new Map()
        for (const record of records) {
            let deviceType = 'Unknown'
            
            // Try to extract device from multiple possible fields
            if (record?.devices && record.devices.length > 0) {
                const device = record.devices[0]
                deviceType = device?.type || deviceType
                
                // If still unknown, try other fields
                if (deviceType === 'Unknown' || !deviceType) {
                    deviceType = device?.deviceType || deviceType
                }
                if (deviceType === 'Unknown' || !deviceType) {
                    deviceType = device?.Device || deviceType
                }
            }
            
            // If still unknown, try presence details
            if (deviceType === 'Unknown' || !deviceType) {
                if (record?.presenceDetails && record.presenceDetails.length > 0) {
                    const detail = record.presenceDetails[0]
                    deviceType = detail?.deviceType || detail?.Device || detail?.device || deviceType
                }
            }
            
            // Format the device type
            devicesByXuid.set(record.xuid, formatDeviceType(deviceType))
        }

        return devicesByXuid
    }

    async getProfile() {
        const token = await this.getXboxToken()
        const { gamertag, gamerpic } = await this.fetchProfile()
        this.gamertag = gamertag

        return {
            xuid: this.xuid,
            gamertag: this.gamertag,
            gamerpic,
            token
        }
    }

    async gamertagToXuid(gamertag) {
        const authHeader = await this.getXboxToken('http://xboxlive.com')

        const response = await resilientFetch(`https://profile.xboxlive.com/users/gt(${gamertag})/profile/settings`, {
            headers: {
                'Accept-Language': 'en-US,en',
                'Authorization': authHeader,
                'Content-Type': 'application/json; charset=utf-8',
                'User-Agent': 'XboxServicesAPI/2021.10.20220301.4 c',
                'x-xbl-contract-version': 2
            }
        })

        switch (response.status) {
            case 200:
                const data = await response.json()
                return data?.profileUsers?.[0]?.id || null
            case 404:
                return null
            default:
                throw new Error(`Failed to convert gamertag to XUID, status ${response.status}`)
        }
    }

    async getXboxUser(xuid) {
        const authHeader = await this.getXboxToken('http://xboxlive.com')

        if (!xuid) xuid = this.xuid

        const response = await resilientFetch(`https://peoplehub.xboxlive.com/users/me/people/xuids(${xuid})/decoration/detail,preferredColor,presenceDetail`, {
            headers: {
                'x-xbl-contract-version': 4,
                'Accept': 'application/json',
                'User-Agent': 'WindowsGameBar/5.823.1271.0',
                'Accept-Language': 'en-US',
                'Authorization': authHeader
            }
        })

        switch (response.status) {
            case 200:
                const data = await response.json()
                return data?.people?.[0] || null
            case 400:
            case 401:
            case 404:
                return null
            default:
                throw new Error(`Failed to fetch Xbox user, status ${response.status}`)
        }
    }

    async getFriendsList() {
        const authHeader = await this.getXboxToken('http://xboxlive.com')

        const response = await resilientFetch('https://social.xboxlive.com/users/me/people/friends/decoration/detail,preferredColor', {
            headers: {
                'Accept': 'application/json',
                'accept-language': 'en-US',
                'Authorization': authHeader,
                'User-Agent': 'WindowsGameBar/5.823.1271.0',
                'x-xbl-contract-version': 3
            }
        })

        if (!response.ok) {
            throw new Error(`Failed to fetch friends list, status ${response.status}`)
        }

        const data = await response.json()
        return data?.people || []
    }

    async addUser(xuid) {
        if (!xuid) return null

        const authHeader = await this.getXboxToken('http://xboxlive.com')

        const response = await resilientFetch(`https://social.xboxlive.com/users/me/people/friends/v2/xuid(${xuid})`, {
            method: 'PUT',
            headers: {
                'Accept': '*/*',
                'accept-language': 'en-US',
                'Authorization': authHeader,
                'content-type': 'application/json',
                'User-Agent': 'WindowsGameBar/5.823.1271.0',
                'x-xbl-contract-version': 3
            }
        })

        switch (response.status) {
            case 200:
                const responseData = await response.json()
                logger?.info?.(`Add user response: ${JSON.stringify(responseData)}`)
                return { data: response.statusText, status: response.status, responseData }
            case 403:
                return { data: response.statusText, status: response.status }
            default:
                throw new Error(`Failed to add user, status ${response.status}`)
        }
    }

    async removeUser(xuid) {
        if (!xuid) return null

        const authHeader = await this.getXboxToken('http://xboxlive.com')

        const response = await resilientFetch(`https://social.xboxlive.com/users/me/people/friends/v2/xuid(${xuid})?deleteRelationships=friends`, {
            method: 'DELETE',
            headers: {
                'Accept': '*/*',
                'accept-language': 'en-US',
                'Authorization': authHeader,
                'content-type': 'application/json',
                'User-Agent': 'WindowsGameBar/5.823.1271.0',
                'x-xbl-contract-version': 3
            }
        })

        switch (response.status) {
            case 200:
                return { data: response.statusText, status: response.status }
            case 403:
                return { data: response.statusText, status: response.status }
            default:
                throw new Error(`Failed to remove user, status ${response.status}`)
        }
    }

    async followUser(xuid) {
        if (!xuid) return null

        const authHeader = await this.getXboxToken('http://xboxlive.com')

        const response = await resilientFetch(`https://social.xboxlive.com/users/xuid(${this.xuid})/people/xuid(${xuid})`, {
            method: 'PUT',
            headers: {
                'x-xbl-contract-version': 3,
                'Accept': 'application/json',
                'accept-language': 'en-US',
                'Authorization': authHeader
            }
        })

        switch (response.status) {
            case 204:
                return { data: response.statusText, status: response.status }
            case 403:
                return { data: response.statusText, status: response.status }
            default:
                throw new Error(`Failed to follow user, status ${response.status}`)
        }
    }

    getDeviceProfile() {
        return { ...createDeviceProfile() }
    }
}

module.exports = { XboxAccount, mongoCacheFactory, createDeviceProfile, clearAuthCacheForUser: deleteAuthCacheForUser }
