const mysql = require('mysql2/promise');

const ITEMS_PER_PAGE = 10;

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
        const currentPage = parseInt(event.queryStringParameters?.page || '1');

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

        // Get total count
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as total FROM player_achievements WHERE player_id = ?',
            [player_id.toString()]
        );
        
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        // Calculate offset
        const offset = (currentPage - 1) * ITEMS_PER_PAGE;

        // Get paginated achievements
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
            ORDER BY date_achieved DESC
            LIMIT ? OFFSET ?`,
            [
                player_id.toString(),
                ITEMS_PER_PAGE.toString(),
                offset.toString()
            ]
        );

        // Parse JSON fields
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
                data: {
                    achievements: formattedAchievements,
                    pagination: {
                        current_page: currentPage,
                        total_pages: totalPages,
                        total_items: totalItems,
                        items_per_page: ITEMS_PER_PAGE,
                        has_next_page: currentPage < totalPages,
                        has_previous_page: currentPage > 1
                    }
                }
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
