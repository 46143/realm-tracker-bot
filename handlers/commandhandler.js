const fs = require('fs')
const path = require('path')

function loadCommands(client) {
    client.commands = new Map()

    const commandsPath = path.join(__dirname, '..', 'commands')
    const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'))

    console.log('[DEBUG] Loading commands from:', commandsPath)
    console.log('[DEBUG] Found files:', files)

    for (const file of files) {
        console.log('[DEBUG] Loading command:', file)
        try {
            const command = require(path.join(commandsPath, file))
            client.commands.set(command.data.name, command)
            console.log('[DEBUG] Successfully loaded:', file)
        } catch (error) {
            console.error('[DEBUG] Error loading', file, ':', error.message)
            console.error('[DEBUG] Error stack:', error.stack)
            throw error
        }
    }

    return client.commands
}

module.exports = { loadCommands }
