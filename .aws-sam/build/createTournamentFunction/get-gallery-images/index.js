const mysql = require('mysql2/promise');

const connectionConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

exports.getGalleryImagesHandler = async (event, context) => {
    let connection;
    
    try {
        const { user_id, team_id } = event.queryStringParameters || {};

        // Validate that either user_id or team_id is provided
        if (!user_id && !team_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Either user_id or team_id must be provided'
                })
            };
        }

        // Connect to database
        connection = await mysql.createConnection(connectionConfig);

        // Build query based on provided parameters
        let query = `
            SELECT 
                image_id,
                user_id,
                team_id,
                cloudflare_image_id,
                caption,
                public_url,
                avatar_url,
                thumbnail_url,
                created_at
            FROM torny_db.images
            WHERE 1=1
        `;
        
        const params = [];
        
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        if (team_id) {
            query += ' AND team_id = ?';
            params.push(team_id);
        }

        query += ' ORDER BY created_at DESC';

        // Execute query
        const [images] = await connection.execute(query, params);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: images
            })
        };

    } catch (error) {
        console.error('Error fetching gallery images:', error);
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
            await connection.end();
        }
    }
};
