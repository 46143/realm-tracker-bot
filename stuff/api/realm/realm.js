const { resilientFetch } = require('../../utils/resilientFetch')

const endpoint = 'bedrock.frontendlegacy.realms.minecraft-services.net'
const gameVersion = '1.26.50'
const protocolVersion = '2193'

async function describeAccessDenied(response) {
    let detail = ''
    try {
        detail = (await response.text()) || ''
    } catch {
        detail = ''
    }

    const lower = detail.toLowerCase()
    if (lower.includes('block') || lower.includes('ban')) {
        return "You're banned from this Realm."
    }

    return "You don't have access to this Realm. You're either not invited, or were removed from it."
}

async function throwForFailedStatus(response) {
    if (response.status === 403) {
        throw new Error(await describeAccessDenied(response))
    }
    throw new Error(`Realm lookup failed with status ${response.status}`)
}

function assertRealmJoinable(realm) {
    if (realm.state === 'CLOSED') throw new Error('This Realm is closed.')
    if (realm.expired) throw new Error('This Realm has expired.')
}

class RealmAPI {
    constructor(xboxAccount) {
        this.xboxAccount = xboxAccount
        this.headers = {
            Accept: '*/*',
            charset: 'utf-8',
            'client-version': gameVersion,
            'x-clientplatform': 'iOS',
            'x-networkprotocolversion': protocolVersion,
            'content-type': 'application/json',
            'user-agent': 'MCPE/IOS',
            'Accept-Language': 'en-US',
            Host: endpoint
        }
    }

    async init() {
        this.authToken = await this.xboxAccount.getXboxToken('https://pocket.realms.minecraft.net/')
    }

    async authorizedRequest(requestPath, init = {}) {
        return resilientFetch(`https://${endpoint}${requestPath}`, {
            ...init,
            headers: {
                ...this.headers,
                authorization: this.authToken,
                ...(init.headers ?? {})
            }
        })
    }

    async getRealmByCode(realmCode) {
        const response = await this.authorizedRequest(`/worlds/v1/link/${realmCode}`)

        if (response.status === 404 || response.status === 400) return null
        if (!response.ok) await throwForFailedStatus(response)

        const realm = await response.json()

        // Always attempt opt-in to ensure access
        console.log(`[RealmAPI] Attempting to opt-in to realm ${realmCode}`)
        const acceptResponse = await this.authorizedRequest(`/invites/v1/link/accept/${realmCode}`, { method: 'POST' })
        console.log(`[RealmAPI] Opt-in response status: ${acceptResponse.status}`)
        if (!acceptResponse.ok) {
            const errorText = await acceptResponse.text().catch(() => '')
            console.log(`[RealmAPI] Opt-in error: ${errorText}`)
            // Don't throw error, continue anyway - might already have access
            console.log(`[RealmAPI] Opt-in failed, continuing anyway`)
        } else {
            console.log(`[RealmAPI] Opt-in successful for realm ${realmCode}`)
        }

        return this.getRealmById(realm.id)
    }

    async getRealmById(realmId) {
        const response = await this.authorizedRequest(`/worlds/${realmId}`)

        if (response.status === 404) return null
        if (!response.ok) await throwForFailedStatus(response)

        return response.json()
    }

    async getRealms() {
        const response = await this.authorizedRequest('/worlds')

        if (!response.ok) await throwForFailedStatus(response)

        const data = await response.json()

        return Array.isArray(data) ? data : Array.isArray(data?.servers) ? data.servers : []
    }

    async postStorySettings(realmId) {
        const body = JSON.stringify({
            notifications: true,
            autostories: true,
            coordinates: true,
            timeline: true,
            playerOptIn: "OPT_IN",
            realmOptIn: "OPT_IN"
        })

        console.log(`[RealmAPI] Posting story settings for realm ${realmId}`)
        const response = await this.authorizedRequest(`/worlds/${realmId}/stories/settings`, {
            method: 'POST',
            body
        })
        console.log(`[RealmAPI] Story settings response status: ${response.status}`)
        return response.ok
    }

    async getConnectionInfo(realmId) {
        console.log(`[RealmAPI] Fetching connection info for realm ${realmId}`)
        while (true) {
            const response = await this.authorizedRequest(`/worlds/${realmId}/join`)
            console.log(`[RealmAPI] Connection info response status: ${response.status}`)

            if (response.status === 200) {
                console.log(`[RealmAPI] Connection info fetched successfully`)
                return response.json()
            }
            if (response.status === 503) {
                console.log(`[RealmAPI] Server busy (503), retrying in 1800ms`)
                await new Promise((resolve) => setTimeout(resolve, 1800))
                continue
            }

            const errorText = await response.text().catch(() => '')
            console.log(`[RealmAPI] Connection info error: ${errorText}`)

            // Handle timeline opt-in requirement
            if (response.status === 403 && errorText.includes('opt_in_required')) {
                console.log(`[RealmAPI] Timeline opt-in required, attempting story settings...`)
                const success = await this.postStorySettings(realmId)
                if (success) {
                    console.log(`[RealmAPI] Story settings successful, retrying connection info`)
                    await new Promise((resolve) => setTimeout(resolve, 500))
                    continue
                }
            }

            await throwForFailedStatus(response)
        }
    }
}

module.exports = { RealmAPI, gameVersion, protocolVersion, assertRealmJoinable }
