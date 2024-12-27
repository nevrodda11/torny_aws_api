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

exports.searchClubsHandler = async (event, context) => {
    console.log('Processing search clubs request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        const { name, sport, country, state, region } = event.queryStringParameters || {};
        
        let query = `SELECT * FROM clubs WHERE 1=1`;
        const params = [];

        if (name) {
            query += ` AND LOWER(name) LIKE LOWER(?)`;
            params.push(`%${name}%`);
        }
        if (sport) {
            query += ` AND sport = ?`;
            params.push(parseInt(sport));
        }
        if (country) {
            query += ` AND LOWER(country) = LOWER(?)`;
            params.push(country);
        }
        if (state) {
            query += ` AND LOWER(state) = LOWER(?)`;
            params.push(state);
        }
        if (region) {
            query += ` AND LOWER(region) = LOWER(?)`;
            params.push(region);
        }

        query += ` ORDER BY name ASC`;

        connection = await mysql.createConnection(connectionConfig);
        console.log('MySQL connection successful');

        const [results] = await connection.execute(query, params);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "success",
                data: results
            })
        };
    } catch (error) {
        console.error('Search clubs error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to search clubs",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
