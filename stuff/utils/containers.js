const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js')

// Modern color palette with better visual appeal
const brandColor = 0x5865F2      // Discord Blau
const successColor = 0x3BA55C    // Modernes Grün
const errorColor = 0xED4245      // Vibrantes Rot
const warningColor = 0xFEE75C    // Gelb
const infoColor = 0x5865F2       // Info Blau
const premiumColor = 0xF1C40F    // Gold

// Emoji prefixes for better visual recognition
const emojis = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
    loading: '⏳',
    check: '✓',
    cross: '✗'
}

function buildContainer(color, title, description, linkButton, thumbnailUrl, imageUrl, emoji = '') {
    const container = new ContainerBuilder().setAccentColor(color)
    
    // Add emoji prefix if provided
    const titleWithEmoji = emoji ? `${emoji} ${title}` : title
    const text = new TextDisplayBuilder().setContent(`**${titleWithEmoji}**\n${description}`)

    if (imageUrl) {
        // Use as main image (larger, more prominent)
        const section = new SectionBuilder()
            .addTextDisplayComponents(text)
            .setImageAccessory(new ThumbnailBuilder().setURL(imageUrl))
        container.addSectionComponents(section)
    } else if (thumbnailUrl) {
        // Use as thumbnail (smaller, side)
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(text)
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
        )
    } else {
        container.addTextDisplayComponents(text)
    }

    if (linkButton) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(linkButton.label)
                .setURL(linkButton.url)
                .setStyle(ButtonStyle.Link)
        )
        container.addActionRowComponents(row)
    }

    return container
}

function successContainer(title, description, linkButton, thumbnailUrl) {
    return buildContainer(successColor, title, description, linkButton, thumbnailUrl, null, emojis.success)
}

function errorContainer(title, description) {
    return buildContainer(errorColor, title, description, null, null, null, emojis.error)
}

function infoContainer(title, description, linkButton) {
    return buildContainer(infoColor, title, description, linkButton, null, null, emojis.info)
}

function warningContainer(title, description, linkButton) {
    return buildContainer(warningColor, title, description, linkButton, null, null, emojis.warning)
}

function loadingContainer(title, description) {
    return buildContainer(infoColor, title, description, null, null, null, emojis.loading)
}

function plainContainer(content) {
    return new ContainerBuilder()
        .setAccentColor(brandColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
        )
}

module.exports = { 
    successContainer, 
    errorContainer, 
    infoContainer, 
    warningContainer,
    loadingContainer,
    plainContainer, 
    ComponentsV2Flags: MessageFlags.IsComponentsV2 
}
