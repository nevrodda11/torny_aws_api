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

exports.getPlayersHandler = async (event, context) => {
    console.log('Processing get players request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        connection = await mysql.createConnection(connectionConfig);
        console.log('MySQL connection successful');

        // Extract search parameters from query string
        const { nameSearch, sport, country, state, region } = event.queryStringParameters || {};

        let query = `
            SELECT 
                u.id as user_id,
                u.name,
                u.email,
                u.avatar_url,
                u.created,
                u.updated,
                u.country,
                u.state,
                u.region,
                pd.sport,
                pd.club,
                pd.achievements
            FROM users u
            LEFT JOIN players_data pd ON u.id = pd.user_id
            WHERE 1=1
        `;

        const params = [];

        if (nameSearch) {
            query += ` AND (
                LOWER(u.name) LIKE LOWER(?) OR
                LOWER(u.email) LIKE LOWER(?)
            )`;
            const searchTerm = `%${nameSearch}%`;
            params.push(searchTerm, searchTerm);
        }

        if (sport) {
            query += ` AND LOWER(pd.sport) = LOWER(?)`;
            params.push(sport);
        }

        if (country) {
            query += ` AND LOWER(u.country) = LOWER(?)`;
            params.push(country);
        }

        if (state) {
            query += ` AND LOWER(u.state) = LOWER(?)`;
            params.push(state);
        }

        if (region) {
            query += ` AND LOWER(u.region) = LOWER(?)`;
            params.push(region);
        }

        query += ` ORDER BY u.name ASC`;

        const [players] = await connection.execute(query, params);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "success",
                data: players
            })
        };

    } catch (error) {
        console.error('Get players error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to fetch players",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
