const mysql = require('mysql2/promise');

const connectionConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

exports.createPlayerAchievementHandler = async (event, context) => {
    let connection;
    
    try {
        const body = JSON.parse(event.body);
        const { 
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
        } = body;

        // Validate required fields
        if (!player_id || !title || !date_achieved) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Missing required fields: player_id, title, and date_achieved are required'
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

        // Insert achievement
        const [result_data] = await connection.execute(
            `INSERT INTO player_achievements (
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                player_id,
                title,
                description || null,
                date_achieved,
                type || null,
                gender || null,
                award_level || null,
                images ? JSON.stringify(images) : null,
                city || null,
                state || null,
                country || null,
                result || null
            ]
        );

        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: {
                    achievement_id: result_data.insertId,
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
                }
            })
        };

    } catch (error) {
        console.error('Error creating player achievement:', error);
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
