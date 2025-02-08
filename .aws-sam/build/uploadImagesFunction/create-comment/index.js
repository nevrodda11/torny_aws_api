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

exports.createCommentHandler = async (event, context) => {
    let connection;
    
    try {
        validateEnvVars();
        const body = JSON.parse(event.body);
        const { 
            user_id,
            entity_type,
            entity_id,
            parent_comment_id,
            comment_text
        } = body;

        // Validate required fields
        if (!user_id || !entity_type || !entity_id || !comment_text) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Missing required fields: user_id, entity_type, entity_id, and comment_text are required'
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

        // Connect to database
        connection = await mysql.createConnection(connectionConfig);

        // Begin transaction
        await connection.beginTransaction();

        // Verify user exists
        const [userExists] = await connection.execute(
            'SELECT id FROM users WHERE id = ?',
            [user_id]
        );

        if (userExists.length === 0) {
            throw new Error('User not found');
        }

        // If parent_comment_id is provided, verify it exists
        if (parent_comment_id) {
            const [parentExists] = await connection.execute(
                'SELECT comment_id FROM comments WHERE comment_id = ?',
                [parent_comment_id]
            );

            if (parentExists.length === 0) {
                throw new Error('Parent comment not found');
            }
        }

        // Insert the comment
        const [result] = await connection.execute(
            `INSERT INTO comments (
                user_id,
                entity_type,
                entity_id,
                parent_comment_id,
                comment_text
            ) VALUES (?, ?, ?, ?, ?)`,
            [
                user_id,
                entity_type,
                entity_id,
                parent_comment_id || null,
                comment_text
            ]
        );

        await connection.commit();

        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                message: 'Comment created successfully',
                data: {
                    comment_id: result.insertId
                }
            })
        };

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error('Error creating comment:', error);

        return {
            statusCode: error.message === 'User not found' || error.message === 'Parent comment not found' ? 404 : 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'error',
                message: error.message === 'User not found' || error.message === 'Parent comment not found' 
                    ? error.message 
                    : 'An error occurred while creating the comment'
            })
        };

    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
