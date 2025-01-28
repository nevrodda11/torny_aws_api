const mysql = require('mysql2/promise');

const connectionConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

const ITEMS_PER_PAGE = 12;

exports.getGalleryImagesHandler = async (event, context) => {
    let connection;
    
    try {
        const { user_id, team_id, page = 1 } = event.queryStringParameters || {};
        const currentPage = parseInt(page);

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

        // Build count query to get total number of images
        let countQuery = `
            SELECT COUNT(*) as total
            FROM torny_db.images
            WHERE 1=1
        `;
        
        const whereParams = [];
        
        if (user_id) {
            countQuery += ' AND user_id = ?';
            whereParams.push(user_id.toString());
        }
        
        if (team_id) {
            countQuery += ' AND team_id = ?';
            whereParams.push(team_id.toString());
        }

        // Get total count
        const [countResult] = await connection.execute(countQuery, whereParams);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        // Build main query with pagination
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
        
        const mainQueryParams = [];
        
        if (user_id) {
            query += ' AND user_id = ?';
            mainQueryParams.push(user_id.toString());
        }
        
        if (team_id) {
            query += ' AND team_id = ?';
            mainQueryParams.push(team_id.toString());
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

        // Add pagination parameters
        const offset = (currentPage - 1) * ITEMS_PER_PAGE;
        mainQueryParams.push(ITEMS_PER_PAGE.toString());
        mainQueryParams.push(offset.toString());

        // Execute query
        const [images] = await connection.execute(query, mainQueryParams);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: {
                    images,
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
