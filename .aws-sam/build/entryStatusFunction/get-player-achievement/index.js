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
        const entity_id = event.pathParameters?.entity_id;
        const entity_type = event.queryStringParameters?.entity_type || 'player';
        const currentPage = parseInt(event.queryStringParameters?.page || '1');

        if (!entity_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Entity ID is required'
                })
            };
        }

        // Connect to database
        connection = await mysql.createConnection(connectionConfig);

        // Get total count
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as total FROM achievements WHERE entity_id = ? AND entity_type = ?',
            [entity_id.toString(), entity_type]
        );
        
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        const offset = (currentPage - 1) * ITEMS_PER_PAGE;

        // Get paginated achievements with their images
        const [achievements] = await connection.execute(
            `SELECT 
                a.achievement_id,
                a.entity_id,
                a.entity_type,
                a.title,
                a.description,
                a.date_achieved,
                a.type,
                a.gender,
                a.award_level,
                a.city,
                a.state,
                a.country,
                a.result,
                COALESCE(
                    JSON_ARRAYAGG(
                        CASE 
                            WHEN i.image_id IS NOT NULL THEN
                                JSON_OBJECT(
                                    'image_id', i.image_id,
                                    'cloudflare_image_id', i.cloudflare_image_id,
                                    'public_url', i.public_url,
                                    'avatar_url', i.avatar_url,
                                    'thumbnail_url', i.thumbnail_url
                                )
                            ELSE NULL
                        END
                    ),
                    JSON_ARRAY()
                ) as images
            FROM achievements a
            LEFT JOIN images i ON a.achievement_id = i.achievement_id
            WHERE a.entity_id = ? AND a.entity_type = ?
            GROUP BY a.achievement_id
            ORDER BY a.date_achieved DESC
            LIMIT ? OFFSET ?`,
            [
                entity_id.toString(),
                entity_type,
                ITEMS_PER_PAGE.toString(),
                offset.toString()
            ]
        );

        // Add console.log to see what we're getting
        console.log('Raw query results:', JSON.stringify(achievements, null, 2));

        // Format the achievements
        const formattedAchievements = achievements.map(achievement => {
            let images = [];
            if (achievement.images) {
                // Filter out null values from the array
                images = achievement.images.filter(img => img !== null);
            }
            
            // Remove the raw images and add the filtered array
            const { images: rawImages, ...achievementData } = achievement;
            return {
                ...achievementData,
                images
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
        console.error('Error fetching achievements:', error);
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
