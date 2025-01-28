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
        
        // First query to get team basic info and member IDs
        const [team] = await connection.execute(`
            SELECT 
                t.*,
                GROUP_CONCAT(DISTINCT tm.user_id ORDER BY tm.position DESC) as member_ids,
                GROUP_CONCAT(DISTINCT tm.position ORDER BY tm.position DESC) as member_positions,
                GROUP_CONCAT(DISTINCT tm.club ORDER BY tm.position DESC) as member_clubs,
                GROUP_CONCAT(DISTINCT tm.status ORDER BY tm.position DESC) as member_statuses,
                -- Club details
                c.name as club_name,
                c.avatar as club_avatar_url,
                c.country as club_country,
                c.state as club_state,
                c.region as club_region,
                c.description as club_description
            FROM teams t
            LEFT JOIN team_members tm ON t.team_id = tm.team_id
            LEFT JOIN clubs_data c ON t.club = c.club_id
            WHERE t.team_id = ?
            GROUP BY t.team_id, c.name, c.avatar, c.country, c.state, c.region, c.description
        `, [teamId]);

        if (!team[0]) {
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

        // If we have members, fetch their current profiles
        let members = [];
        if (team[0].member_ids) {
            const memberIds = team[0].member_ids.split(',');
            const memberIdsString = memberIds.join(',');

            // Get team members data with their current profiles in a single query
            const [teamMembers] = await connection.execute(`
                SELECT 
                    tm.user_id,
                    tm.position,
                    COALESCE(
                        (SELECT cd2.name 
                         FROM torny_db.players_data pd2 
                         LEFT JOIN torny_db.clubs_data cd2 ON pd2.club_id = cd2.club_id 
                         WHERE pd2.user_id = tm.user_id 
                         ORDER BY pd2.id DESC LIMIT 1),
                        tm.club
                    ) as club,
                    tm.status,
                    u.name,
                    u.avatar_url,
                    u.country,
                    u.state,
                    u.region,
                    u.description,
                    pd.gender,
                    cd.name as club_name,
                    cd.avatar as club_avatar_url,
                    cd.country as club_country,
                    cd.state as club_state,
                    cd.region as club_region,
                    cd.description as club_description,
                    a.title as achievement_title,
                    a.description as achievement_description,
                    a.date_achieved as achievement_date,
                    a.type as achievement_type,
                    a.award_level as achievement_level,
                    a.result as achievement_result,
                    a.city as achievement_city
                FROM torny_db.team_members tm
                INNER JOIN torny_db.users u ON tm.user_id = u.id
                LEFT JOIN (
                    SELECT p1.user_id, p1.gender, p1.club as club_id
                    FROM torny_db.players_data p1
                    LEFT JOIN torny_db.players_data p2 
                    ON p1.user_id = p2.user_id AND p1.id < p2.id
                    WHERE p2.id IS NULL
                ) pd ON u.id = pd.user_id
                LEFT JOIN torny_db.clubs_data cd ON pd.club_id = cd.club_id
                LEFT JOIN (
                    SELECT a1.*
                    FROM achievements a1
                    LEFT JOIN achievements a2 ON a1.entity_id = a2.entity_id 
                    AND a1.entity_type = 'player'
                    AND (
                        CASE a2.award_level
                            WHEN 'international' THEN 1
                            WHEN 'national' THEN 2
                            WHEN 'state' THEN 3
                            WHEN 'regional' THEN 4
                            WHEN 'club' THEN 5
                            ELSE 6
                        END < 
                        CASE a1.award_level
                            WHEN 'international' THEN 1
                            WHEN 'national' THEN 2
                            WHEN 'state' THEN 3
                            WHEN 'regional' THEN 4
                            WHEN 'club' THEN 5
                            ELSE 6
                        END
                        OR (
                            a2.award_level = a1.award_level
                            AND a2.date_achieved > a1.date_achieved
                        )
                    )
                    WHERE a2.entity_id IS NULL
                ) a ON u.id = a.entity_id AND a.entity_type = 'player'
                WHERE tm.team_id = ? AND tm.user_id IN (${memberIdsString})
                ORDER BY FIELD(tm.user_id, ${memberIdsString})
            `, [team[0].team_id]);

            console.log('Team Members:', JSON.stringify(teamMembers, null, 2));

            members = teamMembers.map(member => ({
                user_id: parseInt(member.user_id),
                position: member.position || null,
                club: member.club || null,
                status: member.status || null,
                name: member.name || null,
                avatar_url: member.avatar_url || '/avatars/default-player.jpg',
                country: member.country || null,
                state: member.state || null,
                region: member.region || null,
                gender: member.gender || null,
                description: member.description || null,
                club_details: member.club_name ? {
                    name: member.club_name,
                    avatar_url: member.club_avatar_url,
                    country: member.club_country,
                    state: member.club_state,
                    region: member.club_region,
                    description: member.club_description
                } : null,
                top_achievement: member.achievement_title ? {
                    title: member.achievement_title,
                    description: member.achievement_description,
                    date: member.achievement_date,
                    type: member.achievement_type,
                    level: member.achievement_level,
                    result: member.achievement_result,
                    city: member.achievement_city
                } : null
            }));
        }

        // Get manager's current profile
        const [managerProfile] = await connection.execute(`
            SELECT 
                u.*,
                pd.gender
            FROM users u
            LEFT JOIN players_data pd ON u.id = pd.user_id
            WHERE u.id = ?
        `, [team[0].created_by_user_id]);

        // Clean up raw fields from team[0] before spreading
        const cleanTeam = { ...team[0] };
        delete cleanTeam.member_ids;
        delete cleanTeam.member_positions;
        delete cleanTeam.member_clubs;
        delete cleanTeam.member_statuses;
        delete cleanTeam.club_name;
        delete cleanTeam.club_avatar_url;
        delete cleanTeam.club_country;
        delete cleanTeam.club_state;
        delete cleanTeam.club_region;
        delete cleanTeam.club_description;

        const processedTeam = {
            ...cleanTeam,
            members,
            manager: managerProfile[0] ? {
                name: managerProfile[0].name,
                avatar_url: managerProfile[0].avatar_url,
                country: managerProfile[0].country,
                state: managerProfile[0].state,
                region: managerProfile[0].region,
                gender: managerProfile[0].gender,
                description: managerProfile[0].description
            } : null,
            club_details: team[0].club_name ? {
                name: team[0].club_name,
                avatar_url: team[0].club_avatar_url,
                country: team[0].club_country,
                state: team[0].club_state,
                region: team[0].club_region,
                description: team[0].club_description
            } : null
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "success",
                data: {
                    // Base team properties
                    team_id: processedTeam.team_id,
                    team_name: processedTeam.team_name,
                    sport_id: processedTeam.sport_id,
                    club: processedTeam.club,
                    created_by_user_id: processedTeam.created_by_user_id,
                    created_at: processedTeam.created_at,
                    country: processedTeam.country,
                    state: processedTeam.state,
                    region: processedTeam.region,
                    first: processedTeam.first,
                    second: processedTeam.second,
                    third: processedTeam.third,
                    total_prize_money: processedTeam.total_prize_money,
                    ranking: processedTeam.ranking,
                    team_type: processedTeam.team_type,
                    team_status: processedTeam.team_status,
                    team_gender: processedTeam.team_gender,
                    avatar: processedTeam.avatar,
                    main_image: processedTeam.main_image,
                    images: processedTeam.images,

                    // Members array with current profile data
                    members: processedTeam.members.map(member => ({
                        user_id: member.user_id,
                        position: member.position,
                        club: member.club,
                        status: member.status,
                        name: member.name,
                        avatar_url: member.avatar_url,
                        country: member.country,
                        state: member.state,
                        region: member.region,
                        gender: member.gender,
                        description: member.description,
                        club_details: member.club_details,
                        top_achievement: member.top_achievement
                    })),

                    // Manager object with current profile
                    manager: processedTeam.manager,

                    // Club details object
                    club_details: processedTeam.club_details
                }
            })
        };

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
