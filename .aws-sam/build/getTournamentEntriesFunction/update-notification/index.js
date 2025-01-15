const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

exports.updateNotificationHandler = async (event, context) => {
    let connection;
    
    try {
        const notification_id = event.pathParameters?.notification_id;
        
        // Validate required fields
        if (!notification_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Notification ID is required'
                })
            };
        }

        // Connect to database
        connection = await mysql.createConnection(dbConfig);

        // Update notification as read
        const [result] = await connection.query(
            `UPDATE notifications 
            SET is_read = 1, 
                read_at = CURRENT_TIMESTAMP 
            WHERE notification_id = ?`,
            [notification_id]
        );

        if (result.affectedRows === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Notification not found'
                })
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                message: 'Notification marked as read'
            })
        };

    } catch (error) {
        console.error('Error updating notification:', error);
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
