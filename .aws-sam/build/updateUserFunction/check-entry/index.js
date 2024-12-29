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

exports.entryLookupHandler = async (event, context) => {
    console.log('Processing entry lookup request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        connection = await mysql.createConnection(connectionConfig);
        console.log('MySQL connection successful');

        const { tournament_id, user_id } = JSON.parse(event.body);

        console.log('Checking entry for:', { tournament_id, user_id });

        if (!tournament_id || !user_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Missing required parameters"
                })
            };
        }

        const [rows] = await connection.execute(
            `
            SELECT 
                COUNT(*) AS is_entered
            FROM entries e
            LEFT JOIN team_members tm ON tm.team_id = e.team_id
            WHERE e.tournament_id = ?
                AND (e.user_id = ? OR tm.user_id = ?);
            `,
            [tournament_id, user_id, user_id]
        );

        const isEntered = rows[0].is_entered > 0;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "success",
                data: {
                    tournament_id,
                    user_id,
                    isEntered
                }
            })
        };

    } catch (error) {
        console.error('Entry lookup error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to check tournament entry",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
