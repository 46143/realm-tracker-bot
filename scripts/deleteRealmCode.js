const { deleteRealmCode, getAllRealmCodes } = require('../database/models/realmCode')
const mongoose = require('mongoose')
const logger = require('../stuff/utils/logger')

async function deleteCode() {
    const codeToDelete = '34749964'

    // Try the exact URI from config (without database name)
    const uri = 'mongodb://localhost:27017/'
    
    logger.info(`Trying MongoDB with URI: ${uri}`)
    
    try {
        await mongoose.connect(uri)
        logger.info(`Connected to MongoDB`)
        
        // List all databases
        const admin = mongoose.connection.db.admin()
        const databases = await admin.listDatabases()
        logger.info(`Available databases: ${databases.databases.map(db => db.name).join(', ')}`)
        
        // Try each database
        for (const dbInfo of databases.databases) {
            const dbName = dbInfo.name
            if (dbName === 'admin' || dbName === 'local' || dbName === 'config') continue
            
            logger.info(`\nTrying database: ${dbName}`)
            
            try {
                // Switch to this database
                await mongoose.disconnect()
                await mongoose.connect(`mongodb://localhost:27017/${dbName}`)
                
                const allCodes = await getAllRealmCodes()
                logger.info(`Found ${allCodes.length} realm codes in ${dbName}:`)
                
                for (const code of allCodes) {
                    logger.info(`- Code: ${code.code}, Realm: ${code.realmName}, ID: ${code.realmId}`)
                }
                
                if (allCodes.length > 0) {
                    logger.info(`\nDeleting realm code: ${codeToDelete}`)
                    
                    const result = await deleteRealmCode(codeToDelete)
                    
                    if (result) {
                        logger.success(`Successfully deleted code: ${codeToDelete}`)
                        logger.info(`Deleted entry: ${JSON.stringify(result, null, 2)}`)
                    } else {
                        logger.warn(`Code not found: ${codeToDelete}`)
                    }
                    
                    await mongoose.disconnect()
                    process.exit(0)
                }
            } catch (error) {
                logger.error(`Error with database ${dbName}: ${error.message}`)
            }
        }
        
        await mongoose.disconnect()
    } catch (error) {
        logger.error(`Error: ${error.message}`)
        logger.error(`Error stack: ${error.stack}`)
    }
    
    logger.error('Could not find realm codes in any database')
    process.exit(1)
}

deleteCode()
