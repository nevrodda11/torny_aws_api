const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const validateEnvVars = () => {
    console.log('Starting environment variable validation');
    const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE', 'JWT_SECRET'];
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
    },
    connectTimeout: 30000,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0
};

exports.loginUserHandler = async (event, context) => {
    console.log('Processing login request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
            console.log('Parsed body:', body);
        } catch (error) {
            console.error('Error parsing request body:', error);
            console.log('Raw body:', event.body);
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Invalid JSON in request body"
                })
            };
        }

        const { email, password } = body;

        if (!email || !password) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Email and password are required"
                })
            };
        }

        connection = await mysql.createConnection(connectionConfig);
        console.log('MySQL connection successful');

        const [users] = await connection.execute(`
            SELECT u.*, 
                CASE 
                    WHEN u.user_type = 'player' THEN 
                        JSON_OBJECT(
                            'sport', pd.sport,
                            'club', pd.club,
                            'achievements', pd.achievements,
                            'images', pd.images
                        )
                    WHEN u.user_type = 'organiser' THEN 
                        JSON_OBJECT(
                            'club', od.club,
                            'achievements', od.achievements,
                            'images', od.images
                        )
                END as type_specific_data
            FROM users u
            LEFT JOIN players_data pd ON u.id = pd.user_id AND u.user_type = 'player'
            LEFT JOIN organisers_data od ON u.id = od.user_id AND u.user_type = 'organiser'
            WHERE u.email = ?`,
            [email]
        );

        if (users.length === 0) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Invalid credentials"
                })
            };
        }

        const user = users[0];
        console.log('User data from DB:', {
            ...user,
            passwordHash: '[REDACTED]'  // Don't log the password hash
        });
        console.log('Type specific data:', user.type_specific_data);
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isValidPassword) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Invalid credentials"
                })
            };
        }

        const token = jwt.sign(
            { 
                userId: user.id,
                email: user.email,
                userType: user.user_type
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        const userResponse = {
            id: user.id,
            email: user.email,
            name: user.name,
            user_type: user.user_type,
            phone: user.phone,
            address: user.address,
            description: user.description,
            avatar_url: user.avatar_url,
            created: user.created,
            updated: user.updated,
            ...(user.type_specific_data ? 
                (typeof user.type_specific_data === 'string' ? 
                    JSON.parse(user.type_specific_data) : 
                    user.type_specific_data
                ) : {})
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: "success",
                message: "Login successful",
                token: token,
                user: userResponse
            })
        };

    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: "error",
                message: "Login failed",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};