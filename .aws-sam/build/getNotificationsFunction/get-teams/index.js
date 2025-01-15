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

exports.getTeamsHandler = async (event, context) => {
    console.log('Processing get teams request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        connection = await mysql.createConnection(connectionConfig);
        console.log('MySQL connection successful');

        // Extract filter parameters from the query string
        const { search, sport_id, type, gender, country, state } = event.queryStringParameters || {};

        // Build the SQL query with filters
        let query = `
            SELECT 
                t.*,
                t.avatar,
                t.main_image,
                t.images,
                s.name as sport_name,
                COUNT(tm.user_id) as member_count,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'user_id', u.id,
                        'name', u.name,
                        'avatar_url', u.avatar_url,
                        'status', tm.status,
                        'position', tm.position,
                        'club', tm.club
                    )
                ) as team_members
            FROM teams t
            LEFT JOIN team_members tm ON t.team_id = tm.team_id
            LEFT JOIN users u ON tm.user_id = u.id
            LEFT JOIN sports s ON t.sport_id = s.sport_id
            WHERE 1=1
        `;

        const params = [];

        if (search) {
            query += ` AND (
                LOWER(t.team_name) LIKE LOWER(?) OR
                LOWER(s.name) LIKE LOWER(?)
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }

        if (sport_id) {
            query += ` AND t.sport_id = ?`;
            params.push(sport_id);
        }

        if (type) {
            query += ` AND LOWER(t.team_type) = LOWER(?)`;
            params.push(type);
        }

        if (gender) {
            query += ` AND LOWER(t.team_gender) = LOWER(?)`;
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

        query += ` GROUP BY t.team_id ORDER BY t.created_at DESC`;

        const [teams] = await connection.execute(query, params);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "success",
                data: teams
            })
        };

    } catch (error) {
        console.error('Get teams error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to fetch teams",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
