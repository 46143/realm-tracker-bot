function isValidRealmCode(code) {
    // Realm codes should not be purely numeric (to avoid confusion with IDs)
    // They should contain at least one letter or special character
    return typeof code === 'string' && /^[a-zA-Z0-9_-]{6,17}$/.test(code.trim()) && !/^[0-9]+$/.test(code.trim())
}

function isValidRealmId(id) {
    return typeof id === 'string' && /^[0-9]+$/.test(id.trim())
}

module.exports = { isValidRealmCode, isValidRealmId }