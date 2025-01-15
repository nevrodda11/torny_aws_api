const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

exports.getNotificationsHandler = async (event, context) => {
    let connection;
    
    try {
        const user_id = event.pathParameters?.user_id;
        
        // Validate required fields
        if (!user_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'User ID is required'
                })
            };
        }

        // Get pagination parameters
        const page = parseInt(event.queryStringParameters?.page || '1');
        const pageSize = parseInt(event.queryStringParameters?.pageSize || '10');
        const offset = (page - 1) * pageSize;

        // Connect to database
        connection = await mysql.createConnection(dbConfig);

        // Get total count
        const [countResult] = await connection.query(
            'SELECT COUNT(*) as total FROM notifications WHERE user_id = ?',
            [user_id]
        );

        // Get notifications with pagination
        const [notifications] = await connection.query(
            `SELECT 
                notification_id,
                user_id,
                team_id,
                notification_type,
                title,
                message,
                reference_id,
                reference_type,
                link,
                image_url,
                is_read,
                created_at
            FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC, notification_id DESC
            LIMIT ? OFFSET ?`,
            [user_id, pageSize, offset]
        );

        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / pageSize);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: {
                    items: notifications,
                    meta: {
                        totalItems,
                        itemCount: notifications.length,
                        itemsPerPage: pageSize,
                        totalPages,
                        currentPage: page
                    }
                }
            })
        };

    } catch (error) {
        console.error('Error fetching notifications:', error);
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
