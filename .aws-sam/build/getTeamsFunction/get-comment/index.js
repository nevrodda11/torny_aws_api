const mysql = require('mysql2/promise');

const validateEnvVars = () => {
    console.log('Starting environment variable validation');
    const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
    const missing = required.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
        console.error('Missing environment variables:', missing);
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    console.log('Environment validation successful');
};

const connectionConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: {
        rejectUnauthorized: false
    }
};

exports.getCommentsHandler = async (event, context) => {
    let connection;
    
    try {
        validateEnvVars();
        const { entity_type, entity_id } = event.queryStringParameters || {};

        if (!entity_type || !entity_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Missing required parameters: entity_type and entity_id are required'
                })
            };
        }

        // Validate entity_type enum values
        const validEntityTypes = ['achievement', 'image', 'video'];
        if (!validEntityTypes.includes(entity_type)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Invalid entity_type. Must be one of: achievement, image, video'
                })
            };
        }

        connection = await mysql.createConnection(connectionConfig);

        // Get all comments for the entity, including user information
        const [comments] = await connection.execute(
            `SELECT 
                c.*,
                JSON_OBJECT(
                    'id', u.id,
                    'name', u.name,
                    'email', u.email,
                    'avatar_url', u.avatar_url
                ) as user_details,
                (SELECT COUNT(*) FROM comments WHERE parent_comment_id = c.comment_id) as reply_count
            FROM comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.entity_type = ? 
            AND c.entity_id = ?
            ORDER BY 
                CASE WHEN c.parent_comment_id IS NULL THEN c.comment_id ELSE c.parent_comment_id END,
                c.created_at ASC`,
            [entity_type, entity_id]
        );

         // Organize comments into threads
         const commentThreads = comments.reduce((threads, comment) => {
            // Safely parse user_details if it's a string
            let userDetails;
            try {
                userDetails = typeof comment.user_details === 'string' 
                    ? JSON.parse(comment.user_details) 
                    : comment.user_details;
            } catch (error) {
                console.error('Error parsing user_details:', error);
                userDetails = comment.user_details;
            }

            if (!comment.parent_comment_id) {
                // This is a top-level comment
                if (!threads[comment.comment_id]) {
                    threads[comment.comment_id] = {
                        ...comment,
                        user_details: userDetails,
                        replies: []
                    };
                }
            } else {
                // This is a reply
                if (!threads[comment.parent_comment_id]) {
                    threads[comment.parent_comment_id] = { replies: [] };
                }
                threads[comment.parent_comment_id].replies.push({
                    ...comment,
                    user_details: userDetails
                });
            }
            return threads;
        }, {});

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: Object.values(commentThreads)
            })
        };

    } catch (error) {
        console.error('Error fetching comments:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'error',
                message: 'An error occurred while fetching comments'
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
