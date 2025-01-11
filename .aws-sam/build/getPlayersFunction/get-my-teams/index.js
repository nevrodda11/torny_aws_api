const mysql = require('mysql2/promise');

const connectionConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

exports.getMyTeamsHandler = async (event, context) => {
    let connection;
    
    try {
        const { user_id } = event.pathParameters;
        console.log('Getting teams for user:', user_id);

        if (!user_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'user_id is required'
                })
            };
        }

        // Connect to database
        connection = await mysql.createConnection(connectionConfig);

        // Get teams where user is a member
        const [teams] = await connection.execute(
            `SELECT 
                t.team_id,
                t.team_name,
                t.sport_id,
                t.created_by_user_id,
                t.created_at,
                t.country,
                t.state,
                t.region,
                t.first,
                t.second,
                t.third,
                t.total_prize_money,
                t.ranking,
                t.team_type,
                t.team_status,
                t.team_gender,
                t.avatar,
                t.main_image,
                t.images,
                s.name as sport_name,
                tm.status as member_status,
                tm.position as member_position,
                tm.club as member_club,
                COUNT(other_tm.user_id) as member_count,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'user_id', u.id,
                        'name', u.name,
                        'avatar_url', u.avatar_url,
                        'status', other_tm.status,
                        'position', other_tm.position,
                        'club', other_tm.club,
                        'joined_at', other_tm.joined_at
                    )
                ) as team_members
            FROM torny_db.teams t
            INNER JOIN torny_db.team_members tm ON t.team_id = tm.team_id AND tm.user_id = ?
            LEFT JOIN torny_db.team_members other_tm ON t.team_id = other_tm.team_id
            LEFT JOIN torny_db.users u ON other_tm.user_id = u.id
            LEFT JOIN torny_db.sports s ON t.sport_id = s.sport_id
            GROUP BY 
                t.team_id,
                t.team_name,
                t.sport_id,
                t.created_by_user_id,
                t.created_at,
                t.country,
                t.state,
                t.region,
                t.first,
                t.second,
                t.third,
                t.total_prize_money,
                t.ranking,
                t.team_type,
                t.team_status,
                t.team_gender,
                t.avatar,
                t.main_image,
                t.images,
                s.name,
                tm.status,
                tm.position,
                tm.club
            ORDER BY t.created_at DESC`,
            [user_id.toString()]
        );

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: teams
            })
        };

    } catch (error) {
        console.error('Error getting teams:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'error',
                message: 'Internal server error',
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
