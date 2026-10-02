function timestamp() {
    return new Date().toISOString()
}

// Filter out common library noise
function shouldFilter(message) {
    const noisePatterns = [
        'Received answer in stable state',
        'Ignoring',
        'stable state'
    ]
    return noisePatterns.some(pattern => message.includes(pattern))
}

function info(message) {
    if (shouldFilter(message)) return
    console.log(`[${timestamp()}] [INFO] ${message}`)
}

function warn(message) {
    if (shouldFilter(message)) return
    console.warn(`[${timestamp()}] [WARN] ${message}`)
}

function error(message) {
    if (shouldFilter(message)) return
    console.error(`[${timestamp()}] [ERROR] ${message}`)
}

function debug(message) {
    if (shouldFilter(message)) return
    console.log(`[${timestamp()}] [DEBUG] ${message}`)
}

function success(message) {
    if (shouldFilter(message)) return
    console.log(`[${timestamp()}] [SUCCESS] ${message}`)
}

function command(message) {
    if (shouldFilter(message)) return
    console.log(`[${timestamp()}] [COMMAND] ${message}`)
}

function connection(message) {
    if (shouldFilter(message)) return
    console.log(`[${timestamp()}] [CONNECTION] ${message}`)
}

function api(message) {
    if (shouldFilter(message)) return
    console.log(`[${timestamp()}] [API] ${message}`)
}

module.exports = { info, warn, error, debug, success, command, connection, api }
