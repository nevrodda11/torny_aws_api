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
    ssl: { rejectUnauthorized: false }
};

exports.getUserHandler = async (event, context) => {
    let connection = null;
    try {
        validateEnvVars();
        const { user_id } = event.pathParameters;
        
        connection = await mysql.createConnection(connectionConfig);

        // First get user type
        const [userTypeResult] = await connection.execute(
            'SELECT user_type FROM users WHERE id = ?',
            [user_id]
        );

        if (userTypeResult.length === 0) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: "error",
                    message: "User not found"
                })
            };
        }

        const userType = userTypeResult[0].user_type;
        let userData;

        if (userType === 'player') {
            const [rows] = await connection.execute(
                `SELECT u.*, p.sport, p.club, p.achievements, p.images, p.gender 
                 FROM users u 
                 LEFT JOIN players_data p ON u.id = p.user_id 
                 WHERE u.id = ?`,
                [user_id]
            );
            userData = rows[0];
        } else {
            const [rows] = await connection.execute(
                `SELECT u.*, o.club, o.achievements, o.images 
                 FROM users u 
                 LEFT JOIN organisers_data o ON u.id = o.user_id 
                 WHERE u.id = ?`,
                [user_id]
            );
            userData = rows[0];
        }

        // Safely parse JSON fields
        try {
            if (userData.achievements && typeof userData.achievements === 'string') {
                userData.achievements = JSON.parse(userData.achievements);
            } else {
                userData.achievements = [];
            }
            
            if (userData.images && typeof userData.images === 'string') {
                userData.images = JSON.parse(userData.images);
            } else {
                userData.images = [];
            }
        } catch (parseError) {
            console.error('Error parsing JSON fields:', parseError);
            // Set default values if parsing fails
            userData.achievements = [];
            userData.images = [];
        }

        // Remove sensitive fields
        delete userData.passwordHash;

        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // For CORS
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                status: "success",
                data: userData
            })
        };

    } catch (error) {
        console.error('Error fetching user:', error);
        return {
            statusCode: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // For CORS
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to fetch user data"
            })
        };
    } finally {
        if (connection) await connection.end();
    }
};
