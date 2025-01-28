const mysql = require('mysql2/promise');

const connectionConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

exports.deletePlayerAchievementHandler = async (event, context) => {
    let connection;
    
    try {
        const { achievement_id, user_id, entity_type = 'player' } = JSON.parse(event.body);
        console.log('Attempting to delete achievement with ID:', achievement_id);
        console.log('Request made by user:', user_id);
        console.log('Entity type:', entity_type);

        if (!achievement_id || !user_id || !entity_type) {
            console.log('Missing required fields');
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'achievement_id, user_id, and entity_type are required'
                })
            };
        }

        // Connect to database
        console.log('Connecting to database...');
        connection = await mysql.createConnection(connectionConfig);

        // First, get the achievement details to check ownership
        const [achievementDetails] = await connection.execute(
            'SELECT entity_id, entity_type FROM achievements WHERE achievement_id = ?',
            [achievement_id.toString()]
        );

        if (achievementDetails.length === 0) {
            console.log('No achievement found with ID:', achievement_id);
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Achievement not found'
                })
            };
        }

        // Add debug logging
        console.log('Achievement details:', achievementDetails[0]);
        console.log('Achievement entity_id:', achievementDetails[0].entity_id);
        console.log('Achievement entity_type:', achievementDetails[0].entity_type);
        console.log('Request user_id:', user_id);
        console.log('Request entity_type:', entity_type);

        // Check if entity type matches
        if (achievementDetails[0].entity_type !== entity_type) {
            console.log('Entity type mismatch');
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Invalid entity type for this achievement'
                })
            };
        }

        // Check if user owns the achievement - convert both to strings for comparison
        if (achievementDetails[0].entity_id.toString() !== user_id.toString()) {
            console.log('User not authorized to delete this achievement');
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'You are not authorized to delete this achievement'
                })
            };
        }

        // Delete the achievement
        console.log('Deleting achievement from database...');
        const [deleteResult] = await connection.execute(
            'DELETE FROM achievements WHERE achievement_id = ?',
            [achievement_id.toString()]
        );

        console.log('Achievement deleted successfully');
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                message: 'Achievement deleted successfully'
            })
        };

    } catch (error) {
        console.error('Error deleting achievement:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'error',
                message: 'Internal server error',
                details: error.message
            })
        };
    } finally {
        if (connection) {
            console.log('Closing database connection');
            await connection.end();
        }
    }
}; 