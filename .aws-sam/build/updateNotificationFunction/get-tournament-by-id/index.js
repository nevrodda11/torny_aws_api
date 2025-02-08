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

exports.getTournamentByIdHandler = async (event, context) => {
    console.log('Processing get tournament by id request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        connection = await mysql.createConnection(connectionConfig);
        console.log('MySQL connection successful');

        const tournamentId = event.pathParameters?.id;
        
        if (!tournamentId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Tournament ID is required"
                })
            };
        }

        const query = `
            SELECT 
                t.*,
                JSON_OBJECT(
                    'id', u.id,
                    'name', u.name,
                    'email', u.email,
                    'phone', u.phone,
                    'description', u.description,
                    'avatar_url', u.avatar_url,
                    'user_type', u.user_type,
                    'organiser_type', od.organiser_type,
                    'club_data',
                    CASE 
                        WHEN u.user_type = 'organiser' THEN 
                            (
                                SELECT JSON_OBJECT(
                                    'id', cd.club_id,
                                    'sport', cd.sport,
                                    'name', cd.name,
                                    'description', cd.description,
                                    'achievements', cd.achievements,
                                    'avatar', cd.avatar,
                                    'banner_image', cd.banner_image,
                                    'country', cd.country,
                                    'state', cd.state,
                                    'region', cd.region
                                )
                                FROM torny_db.organisers_data od2
                                LEFT JOIN torny_db.clubs_data cd ON od2.club_id = cd.club_id
                                WHERE od2.user_id = t.created_by_user_id
                                LIMIT 1
                            )
                        WHEN u.user_type = 'player' THEN 
                            JSON_OBJECT(
                                'sport', pd.sport,
                                'club', pd.club,
                                'achievements', pd.achievements,
                                'images', pd.images
                            )
                    END
                ) as organizer_details
            FROM tournaments t
            LEFT JOIN users u ON t.created_by_user_id = u.id
            LEFT JOIN players_data pd ON u.id = pd.user_id AND u.user_type = 'player'
            LEFT JOIN organisers_data od ON u.id = od.user_id AND u.user_type = 'organiser'
            WHERE t.id = ?`;

        const [tournaments] = await connection.execute(query, [tournamentId]);

        if (tournaments.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Tournament not found"
                })
            };
        }

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
                data: tournaments[0]
            })
        };

    } catch (error) {
        console.error('Get tournament by id errorr:', error);
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
                message: "Failed to fetch tournament",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
