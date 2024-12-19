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

exports.getOrganisersTournamentsHandler = async (event, context) => {
    console.log('Processing get organisers tournaments request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        const user_id = event.pathParameters?.id;
        console.log('Getting tournaments for user_id:', user_id);

        // Extract filter parameters
        const { gender, type, period, search } = event.queryStringParameters || {};
        console.log('Filters applied - Gender:', gender, 'Type:', type, 'Period:', period, 'Search:', search);

        if (!user_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Missing user_id parameter"
                })
            };
        }

        connection = await mysql.createConnection(connectionConfig);
        console.log('MySQL connection successful');

        // Build the SQL query with case-insensitive filters
        let query = `
            SELECT t.*, u.name as organizer_name 
            FROM tournaments t
            LEFT JOIN users u ON t.created_by_user_id = u.id
            WHERE t.created_by_user_id = ?`;

        const params = [user_id];

        // Add search filter if provided
        if (search) {
            query += ` AND (
                LOWER(t.title) LIKE LOWER(?) OR
                LOWER(t.description) LIKE LOWER(?) OR
                LOWER(t.location) LIKE LOWER(?) OR
                LOWER(t.sport) LIKE LOWER(?)
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Add gender filter if provided
        if (gender) {
            query += ` AND LOWER(t.gender) = LOWER(?)`;
            params.push(gender);
        }

        // Add type filter if provided
        if (type) {
            query += ` AND LOWER(t.type) = LOWER(?)`;
            params.push(type);
        }

        // Add date range filter if period is provided
        if (period) {
            let dateFilter;
            switch(period.toLowerCase()) {
                case 'week':
                    dateFilter = 'DATE(t.start_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)';
                    break;
                case 'month':
                    dateFilter = 'DATE(t.start_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 MONTH)';
                    break;
                case '3months':
                    dateFilter = 'DATE(t.start_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 MONTH)';
                    break;
                case 'year':
                    dateFilter = 'DATE(t.start_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 YEAR)';
                    break;
                default:
                    console.log('Invalid period specified:', period);
            }
            
            if (dateFilter) {
                query += ` AND ${dateFilter}`;
            }
        }

        // Add ordering
        query += ` ORDER BY t.start_date ASC`;

        console.log('Executing query with params:', params);
        const [tournaments] = await connection.execute(query, params);
        console.log(`Found ${tournaments.length} tournaments for user_id:`, user_id);

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
            try {
                await connection.end();
                console.log('Database connection closed');
            } catch (closeError) {
                console.error('Error closing database connection:', closeError);
            }
        }
    }
};
