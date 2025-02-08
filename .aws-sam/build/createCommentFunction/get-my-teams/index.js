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
        const { 
            team_name, 
            team_status, 
            team_type, 
            team_gender, 
            sport_id,
            member_status,
            page = '1',
            limit = '10'
        } = event.queryStringParameters || {};
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

        // Build the WHERE clause based on search parameters
        const whereConditions = ['tm.user_id = ?'];
        const queryParams = [user_id.toString()];

        // Add member status filter if provided, otherwise show all statuses
        if (member_status) {
            whereConditions.push('tm.status = ?');
            queryParams.push(member_status);
        } else {
            whereConditions.push('tm.status IN ("approved", "pending", "declined")');
        }

        if (team_name) {
            whereConditions.push('t.team_name LIKE ?');
            queryParams.push(`%${team_name}%`);
        }

        if (team_status) {
            whereConditions.push('t.team_status = ?');
            queryParams.push(team_status);
        }

        if (team_type) {
            whereConditions.push('t.team_type = ?');
            queryParams.push(team_type);
        }

        if (team_gender) {
            whereConditions.push('t.team_gender = ?');
            queryParams.push(team_gender);
        }

        if (sport_id) {
            whereConditions.push('t.sport_id = ?');
            queryParams.push(sport_id);
        }

        // Pagination
        const currentPage = parseInt(page);
        const itemsPerPage = parseInt(limit);
        const offset = (currentPage - 1) * itemsPerPage;

        // Add pagination parameters to a new array to keep original queryParams intact
        const queryParamsWithPagination = [...queryParams, itemsPerPage, offset];

        // Debug log
        console.log('Where conditions:', whereConditions);
        console.log('Query params:', queryParams);
        console.log('Query params with pagination:', queryParamsWithPagination);

        // Get teams where user is a member with count
        const [countResult] = await connection.execute(`
            SELECT COUNT(DISTINCT t.team_id) as total
            FROM torny_db.teams t
            INNER JOIN torny_db.team_members tm ON t.team_id = tm.team_id
            LEFT JOIN torny_db.team_members other_tm ON t.team_id = other_tm.team_id
            LEFT JOIN torny_db.users u ON other_tm.user_id = u.id
            LEFT JOIN torny_db.sports s ON t.sport_id = s.sport_id
            WHERE ${whereConditions.join(' AND ')}
        `, queryParams);

        // Use query() instead of execute() for the paginated query
        const [teams] = await connection.query(`
            SELECT 
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
            INNER JOIN torny_db.team_members tm ON t.team_id = tm.team_id
            LEFT JOIN torny_db.team_members other_tm ON t.team_id = other_tm.team_id
            LEFT JOIN torny_db.users u ON other_tm.user_id = u.id
            LEFT JOIN torny_db.sports s ON t.sport_id = s.sport_id
            WHERE ${whereConditions.join(' AND ')}
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
            ORDER BY t.created_at DESC
            LIMIT ?, ?`,
            [...queryParams, offset, itemsPerPage]
        );

        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: teams,
                pagination: {
                    current_page: currentPage,
                    items_per_page: itemsPerPage,
                    total_items: totalItems,
                    total_pages: totalPages
                }
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
