const mysql = require('mysql2/promise');

const VALID_PAYMENT_TYPES = ['cash', 'credit', 'bank transfer', 'other'];
const VALID_MANAGE_TYPES = ['self', 'torny', 'hybrid'];
const TEAM_TYPES = ['pairs', 'triples', 'fours'];

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

exports.createTournamentHandler = async (event, context) => {
    console.log('Starting tournament creation process');
    console.log('Received event:', JSON.stringify(event, null, 2));
    let connection = null;
    
    try {
        console.log('Validating environment variables');
        validateEnvVars();
        
        // Parse the request body
        console.log('Parsing request body');
        const requestBody = JSON.parse(event.body);
        console.log('Received request body:', JSON.stringify(requestBody, null, 2));
        
        const { 
            title, description, sport, gender, location,
            entries, entry_fee, total_prize_money, first_prize,
            second_prize, third_prize, entries_close,
            start_date, end_date, created_by_user_id,
            approved, featured, country, state, region,
            max_entries
        } = requestBody;
        
        // Destructure payment_type, manage_type, and type separately using let
        let { payment_type, manage_type, type } = requestBody;

        // Determine entry_type based on tournament type
        console.log('Determining entry type based on tournament type:', type);
        const entry_type = TEAM_TYPES.includes(type?.toLowerCase()) ? 'team' : 'individual';
        console.log('Entry type determined:', entry_type);

        console.log('Validating required fields');
        // Validate required fields
        if (!title || !sport || !location || !start_date || !end_date || !created_by_user_id) {
            console.error('Missing required fields:', {
                title: !title,
                sport: !sport,
                location: !location,
                start_date: !start_date,
                end_date: !end_date,
                created_by_user_id: !created_by_user_id
            });
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Missing required fields"
                })
            };
        }

        console.log('Validating payment type');
        // Validate payment_type if provided
        if (payment_type) {
            console.log('Payment type provided:', payment_type);
            if (!VALID_PAYMENT_TYPES.includes(payment_type.toLowerCase())) {
                console.error('Invalid payment type:', payment_type);
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST,OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                    },
                    body: JSON.stringify({
                        status: "error",
                        message: `Invalid payment type. Must be one of: ${VALID_PAYMENT_TYPES.join(', ')}`
                    })
                };
            }
        }

        console.log('Validating manage type');
        // Validate manage_type if provided
        if (manage_type) {
            console.log('Manage type provided:', manage_type);
            if (!VALID_MANAGE_TYPES.includes(manage_type.toLowerCase())) {
                console.error('Invalid manage type:', manage_type);
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST,OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                    },
                    body: JSON.stringify({
                        status: "error",
                        message: `Invalid manage type. Must be one of: ${VALID_MANAGE_TYPES.join(', ')}`
                    })
                };
            }
        }

        // Transform values to match ENUM values
        console.log('Transforming enum values');
        if (payment_type) {
            payment_type = payment_type.toLowerCase();
            console.log('Transformed payment type:', payment_type);
        }
        if (manage_type) {
            manage_type = manage_type.toLowerCase();
            console.log('Transformed manage type:', manage_type);
        }

        console.log('Creating database connection');
        connection = await mysql.createConnection(connectionConfig);
        
        console.log('Beginning transaction');
        await connection.beginTransaction();

        const insertQuery = `INSERT INTO tournaments (
            title, description, sport, type, gender, location,
            entries, entry_fee, total_prize_money, first_prize,
            second_prize, third_prize, payment_type, manage_type, entries_close,
            start_date, end_date, created_by_user_id,
            approved, featured, country, state, region,
            max_entries, entry_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const insertValues = [
            title, description, sport, type, gender, location,
            entries, entry_fee, total_prize_money, first_prize,
            second_prize, third_prize, payment_type, manage_type, entries_close,
            start_date, end_date, created_by_user_id,
            approved ?? null, featured ?? null, country ?? null, state ?? null, region ?? null,
            max_entries ?? null, entry_type
        ];

        console.log('Executing insert query:', insertQuery);
        console.log('Insert values:', JSON.stringify(insertValues, null, 2));

        const [result] = await connection.execute(insertQuery, insertValues);
        console.log('Insert result:', JSON.stringify(result, null, 2));

        console.log('Committing transaction');
        await connection.commit();

        console.log('Tournament created successfully');
        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({
                status: "success",
                message: "Tournament created successfully",
                data: {
                    tournament_id: result.insertId
                }
            })
        };

    } catch (error) {
        console.error('Tournament creation error:', error);
        console.error('Error stack:', error.stack);

        if (connection) {
            console.log('Rolling back transaction');
            try {
                await connection.rollback();
                console.log('Rollback successful');
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError);
                console.error('Rollback error stack:', rollbackError.stack);
            }
        }

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to create tournament",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            console.log('Closing database connection');
            try {
                await connection.end();
                console.log('Database connection closed successfully');
            } catch (closeError) {
                console.error('Error closing connection:', closeError);
                console.error('Connection close error stack:', closeError.stack);
            }
        }
    }
};
