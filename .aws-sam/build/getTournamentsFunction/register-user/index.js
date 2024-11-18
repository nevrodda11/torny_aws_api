const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const validateEnvVars = () => {
    console.log('Starting environment variable validation');
    const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
    const missing = required.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
        console.error('Missing environment variabless:', missing);
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

exports.registerUserHandler = async (event, context) => {
    console.log('Handler started - Event:', JSON.stringify(event));
    let connection = null;
    
    try {
        validateEnvVars();
        
        console.log('Attempting MySQL connection with config:', {
            host: connectionConfig.host,
            port: connectionConfig.port,
            user: connectionConfig.user,
            database: connectionConfig.database,
            ssl: connectionConfig.ssl
        });

        connection = await mysql.createConnection(connectionConfig);
        console.log('MySQL connection successful');

        // Test the connection
        const [rows] = await connection.execute('SELECT 1');
        console.log('MySQL test query successful:', rows);

        console.log('Parsing request body');
        const body = JSON.parse(event.body);
        console.log('Request body:', JSON.stringify(body));
        
        const { email, name, password, sport, account_type, phone, address, description, avatar_url, club, achievements, images } = body;

        if (!email || !name || !password || !account_type) {
            console.log('Validation failed - Missing required fields');
            console.log('Received fields:', JSON.stringify({ email, name, password: '***', account_type }));
            
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Missing required fields"
                })
            };
        }

        console.log('Hashing password');
        const passwordHash = await bcrypt.hash(password, 10);
        
        console.log('Inserting user data');
        const [userResult] = await connection.execute(
            'INSERT INTO users (user_type, name, email, phone, address, description, avatar_url, passwordHash, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
            [account_type, name, email, phone || null, address || null, description || null, avatar_url || null, passwordHash]
        );

        const userId = userResult.insertId;
        console.log('User inserted with ID:', userId);

        if (account_type === 'player') {
            console.log('Inserting player data');
            await connection.execute(
                'INSERT INTO players_data (user_id, sport, club, achievements, images) VALUES (?, ?, ?, ?, ?)',
                [userId, sport || null, club || null, achievements ? JSON.stringify(achievements) : null, images ? JSON.stringify(images) : null]
            );
        } else if (account_type === 'organiser') {
            console.log('Inserting organiser data');
            await connection.execute(
                'INSERT INTO organisers_data (user_id, club, achievements, images) VALUES (?, ?, ?, ?)',
                [userId, club || null, achievements ? JSON.stringify(achievements) : null, images ? JSON.stringify(images) : null]
            );
        }

        console.log('Registration successful');
        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: "success",
                message: "User registered successfully"
            })
        };

    } catch (error) {
        console.error('Error in registration process:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: "error",
                message: "An error occurred during registration"
            })
        };
    }
}; 