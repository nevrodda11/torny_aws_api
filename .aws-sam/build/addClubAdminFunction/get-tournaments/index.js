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
    },
    connectTimeout: 30000,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0
};

exports.getTournamentsHandler = async (event, context) => {
    console.log('Processing get tournaments request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        connection = await mysql.createConnection(connectionConfig);
        console.log('MySQL connection successful');

        // Extract filter parameters from the query string
        const { 
            search, sport, type, gender, country, state, region,
            startDate, endDate, minPrizeMoney, maxPrizeMoney 
        } = event.queryStringParameters || {};

        // Build the SQL query with filters
        let query = `
            SELECT t.*, u.name as organizer_name 
            FROM tournaments t
            LEFT JOIN users u ON t.created_by_user_id = u.id
            WHERE 1=1`;

        const params = [];

        if (search) {
            query += ` AND (
                LOWER(t.title) LIKE LOWER(?) OR
                LOWER(t.type) LIKE LOWER(?) OR
                LOWER(t.gender) LIKE LOWER(?) OR
                LOWER(t.sport) LIKE LOWER(?) OR
                LOWER(t.country) LIKE LOWER(?) OR
                LOWER(t.state) LIKE LOWER(?) OR
                LOWER(t.region) LIKE LOWER(?)
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (sport) {
            query += ` AND LOWER(t.sport) = LOWER(?)`;
            params.push(sport);
        }
        if (type) {
            query += ` AND LOWER(t.type) = LOWER(?)`;
            params.push(type);
        }
        if (gender) {
            query += ` AND LOWER(t.gender) = LOWER(?)`;
            params.push(gender);
        }
        if (country) {
            query += ` AND LOWER(t.country) = LOWER(?)`;
            params.push(country);
        }
        if (state) {
            query += ` AND LOWER(t.state) = LOWER(?)`;
            params.push(state);
        }
        if (region) {
            query += ` AND LOWER(t.region) = LOWER(?)`;
            params.push(region);
        }

        if (startDate) {
            query += ` AND DATE(t.start_date) >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND DATE(t.end_date) <= ?`;
            params.push(endDate);
        }

        if (minPrizeMoney) {
            query += ` AND t.total_prize_money >= ?`;
            params.push(parseFloat(minPrizeMoney));
        }
        if (maxPrizeMoney) {
            query += ` AND t.total_prize_money <= ?`;
            params.push(parseFloat(maxPrizeMoney));
        }

        query += ` ORDER BY t.created_at DESC`;

        const [tournaments] = await connection.execute(query, params);
        console.log('Tournaments fetched successfully');

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({
                status: "success",
                data: tournaments
            })
        };

    } catch (error) {
        console.error('Get tournaments error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to fetch tournaments",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
