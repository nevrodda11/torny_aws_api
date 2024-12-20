const mysql = require('mysql2/promise');
const fetch = require('node-fetch');

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

async function uploadTournamentImage(imageData, filename) {
    try {
        const response = await fetch('https://ieg3lhlyy0.execute-api.ap-southeast-2.amazonaws.com/Prod/upload-images', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                images: [{
                    image: imageData,
                    filename: filename
                }]
            })
        });

        const result = await response.json();
        console.log('Image upload response:', JSON.stringify(result, null, 2));

        if (!result.success && !result.status === 'success') {
            throw new Error('Failed to upload image');
        }

        // Extract the first image from the response
        const uploadedImage = result.data[0];
        console.log('Uploaded image data:', JSON.stringify(uploadedImage, null, 2));

        // Verify the variants exist
        if (!uploadedImage.variants) {
            console.error('No variants found in response');
            throw new Error('Image upload response missing variants');
        }

        return uploadedImage;
    } catch (error) {
        console.error('Error in uploadTournamentImage:', error);
        throw error;
    }
}

exports.createTournamentHandler = async (event, context) => {
    console.log('Starting tournament creation process');
    let connection = null;
    let imageData = null;
    
    try {
        validateEnvVars();
        const requestBody = JSON.parse(event.body);
        
        // Handle image upload if present
        if (requestBody.image?.data) {
            console.log('Uploading tournament image');
            imageData = await uploadTournamentImage(
                requestBody.image.data,
                `tournament-${Date.now()}.jpg`
            );
            console.log('Image data received:', JSON.stringify(imageData, null, 2));
        }

        // Parse the request body
        console.log('Parsing request body');
        const { 
            title, description, sport, sport_id, gender, location,
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
            title, description, sport, sport_id, type, gender, location,
            entries, entry_fee, total_prize_money, first_prize,
            second_prize, third_prize, payment_type, manage_type, entries_close,
            start_date, end_date, created_by_user_id,
            approved, featured, country, state, region,
            max_entries, entry_type, hero_image, thumbnail_image, image_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const insertValues = [
            title, description, sport, sport_id ?? null, type, gender, location,
            entries, entry_fee, total_prize_money, first_prize,
            second_prize, third_prize, payment_type, manage_type, entries_close,
            start_date, end_date, created_by_user_id,
            approved ?? null, featured ?? null, country ?? null, state ?? null, region ?? null,
            max_entries ?? null, entry_type,
            imageData?.variants?.public ?? null,  // hero_image
            imageData?.variants?.thumbnail ?? null, // thumbnail_image
            imageData?.id ?? null  // image_id
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
                    tournament_id: result.insertId,
                    hero_image: imageData?.variants?.public,
                    thumbnail_image: imageData?.variants?.thumbnail,
                    image_id: imageData?.id
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
