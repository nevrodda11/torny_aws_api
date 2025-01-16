const mysql = require('mysql2/promise');

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

exports.getTeamByIdHandler = async (event, context) => {
    let connection;
    
    try {
        // Add validation for teamId
        if (!event.pathParameters || !event.pathParameters.id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Team ID is required"
                })
            };
        }

        const teamId = event.pathParameters.id;
        console.log('Getting team details for team ID:', teamId);
        
        connection = await mysql.createConnection(connectionConfig);
        
        // Get team details
        const [team] = await connection.execute(`
            SELECT 
                t.*,
                GROUP_CONCAT(DISTINCT tm.user_id ORDER BY tm.position DESC) as member_ids,
                GROUP_CONCAT(DISTINCT tm.position ORDER BY tm.position DESC) as member_positions,
                GROUP_CONCAT(DISTINCT tm.club ORDER BY tm.position DESC) as member_clubs,
                GROUP_CONCAT(DISTINCT tm.status ORDER BY tm.position DESC) as member_statuses,
                GROUP_CONCAT(DISTINCT u.name ORDER BY tm.position DESC) as member_names,
                GROUP_CONCAT(DISTINCT u.avatar_url ORDER BY tm.position DESC) as member_avatar_urls,
                GROUP_CONCAT(DISTINCT u.country ORDER BY tm.position DESC) as member_countries,
                GROUP_CONCAT(DISTINCT u.state ORDER BY tm.position DESC) as member_states,
                GROUP_CONCAT(DISTINCT u.region ORDER BY tm.position DESC) as member_regions,
                -- Club details
                c.name as club_name,
                c.avatar as club_avatar_url,
                c.country as club_country,
                c.state as club_state,
                c.region as club_region,
                c.description as club_description,
                -- Manager details
                manager.name as manager_name,
                manager.avatar_url as manager_avatar_url,
                manager.country as manager_country,
                manager.state as manager_state,
                manager.region as manager_region,
                pd.gender as manager_gender,
                manager.description as manager_description
            FROM teams t
            LEFT JOIN team_members tm ON t.team_id = tm.team_id
            LEFT JOIN users u ON tm.user_id = u.id
            LEFT JOIN users manager ON t.created_by_user_id = manager.id
            LEFT JOIN players_data pd ON manager.id = pd.user_id
            LEFT JOIN clubs_data c ON t.club = c.club_id
            WHERE t.team_id = ?
            GROUP BY t.team_id, manager.name, manager.avatar_url, manager.country, manager.state, manager.region, pd.gender, manager.description,
                     c.name, c.avatar, c.country, c.state, c.region, c.description
        `, [teamId]);

        if (team.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Team not found"
                })
            };
        }

        // Process the response to convert comma-separated strings to arrays
        if (team[0]) {
            const processedTeam = {
                ...team[0],
                members: team[0].member_ids ? team[0].member_ids.split(',').map((id, index) => ({
                    user_id: parseInt(id),
                    position: team[0].member_positions?.split(',')[index] || null,
                    club: team[0].member_clubs?.split(',')[index] || null,
                    status: team[0].member_statuses?.split(',')[index] || null,
                    name: team[0].member_names?.split(',')[index] || null,
                    avatar_url: team[0].member_avatar_urls?.split(',')[index] || null,
                    country: team[0].member_countries?.split(',')[index] || null,
                    state: team[0].member_states?.split(',')[index] || null,
                    region: team[0].member_regions?.split(',')[index] || null
                })) : [],
                manager: {
                    name: team[0].manager_name || null,
                    avatar_url: team[0].manager_avatar_url || null,
                    country: team[0].manager_country || null,
                    state: team[0].manager_state || null,
                    region: team[0].manager_region || null,
                    gender: team[0].manager_gender || null,
                    description: team[0].manager_description || null
                },
                club_details: team[0].club_name ? {
                    name: team[0].club_name,
                    avatar_url: team[0].club_avatar_url,
                    country: team[0].club_country,
                    state: team[0].club_state,
                    region: team[0].club_region,
                    description: team[0].club_description
                } : null
            };

            // Clean up the response by removing the raw concatenated fields
            delete processedTeam.member_ids;
            delete processedTeam.member_positions;
            delete processedTeam.member_clubs;
            delete processedTeam.member_statuses;
            delete processedTeam.member_names;
            delete processedTeam.member_avatar_urls;
            delete processedTeam.member_countries;
            delete processedTeam.member_states;
            delete processedTeam.member_regions;
            delete processedTeam.manager_name;
            delete processedTeam.manager_avatar_url;
            delete processedTeam.manager_country;
            delete processedTeam.manager_state;
            delete processedTeam.manager_region;
            delete processedTeam.manager_gender;
            delete processedTeam.manager_description;
            delete processedTeam.club_name;
            delete processedTeam.club_avatar_url;
            delete processedTeam.club_country;
            delete processedTeam.club_state;
            delete processedTeam.club_region;
            delete processedTeam.club_description;

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "success",
                    data: processedTeam
                })
            };
        }

    } catch (error) {
        console.error('Error getting team:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to get team detailss",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
