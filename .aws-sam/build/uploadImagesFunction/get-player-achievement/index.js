const mysql = require('mysql2/promise');

const connectionConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

exports.getPlayerAchievementHandler = async (event, context) => {
    let connection;
    
    try {
        const player_id = event.pathParameters?.player_id;

        if (!player_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Player ID is required'
                })
            };
        }

        // Connect to database
        connection = await mysql.createConnection(connectionConfig);

        // Verify player exists
        const [players] = await connection.execute(
            'SELECT user_id FROM players_data WHERE user_id = ?',
            [player_id]
        );

        if (players.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Player not found'
                })
            };
        }

        // Get all achievements for the player
        const [achievements] = await connection.execute(
            `SELECT 
                achievement_id,
                player_id,
                title,
                description,
                date_achieved,
                type,
                gender,
                award_level,
                images,
                city,
                state,
                country,
                result
            FROM player_achievements 
            WHERE player_id = ?
            ORDER BY date_achieved DESC`,
            [player_id]
        );

        // Parse JSON fields if they exist and are valid JSON strings
        const formattedAchievements = achievements.map(achievement => {
            let parsedImages = [];
            if (achievement.images) {
                try {
                    parsedImages = JSON.parse(achievement.images);
                } catch (e) {
                    console.warn('Failed to parse images JSON for achievement:', achievement.achievement_id);
                }
            }
            
            return {
                ...achievement,
                images: parsedImages
            };
        });

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: formattedAchievements
            })
        };

    } catch (error) {
        console.error('Error fetching player achievements:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'error',
                message: 'Internal server error'
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
