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

exports.getTournamentEntriesHandler = async (event, context) => {
    console.log('Processing get tournament entries request');
    let connection = null;

    try {
        validateEnvVars();
        
        const tournament_id = event.pathParameters?.tournament_id;
        
        if (!tournament_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Tournament ID is required"
                })
            };
        }

        connection = await mysql.createConnection(connectionConfig);
        
        // Get regular team entries
        const [teamEntries] = await connection.execute(`
            SELECT 
                t.team_id,
                t.team_name,
                MAX(tm.club) as club,
                t.team_type,
                t.team_gender,
                t.avatar,
                t.country,
                t.state,
                t.region,
                'permanent' as entry_type,
                e.entry_date,
                GROUP_CONCAT(DISTINCT tm.user_id) as member_ids,
                GROUP_CONCAT(DISTINCT tm.position) as member_positions,
                GROUP_CONCAT(DISTINCT tm.club) as member_clubs,
                GROUP_CONCAT(DISTINCT u.name) as member_names,
                GROUP_CONCAT(u.avatar_url) as member_avatar_urls
            FROM entries e
            JOIN teams t ON e.team_id = t.team_id
            LEFT JOIN team_members tm ON t.team_id = tm.team_id
            LEFT JOIN users u ON tm.user_id = u.id
            WHERE e.tournament_id = ?
            GROUP BY 
                t.team_id, 
                t.team_name,
                t.team_type,
                t.team_gender,
                t.avatar,
                t.country,
                t.state,
                t.region,
                e.entry_date
        `, [tournament_id]);

        // Get temporary team entries
        const [tempTeamEntries] = await connection.execute(`
            SELECT 
                tt.temp_team_id as team_id,
                tt.team_name,
                tt.club,
                tt.team_type,
                tt.team_gender,
                tt.avatar,
                tt.country,
                tt.state,
                tt.region,
                'temporary' as entry_type,
                e.entry_date,
                GROUP_CONCAT(DISTINCT tm.user_id) as member_ids,
                GROUP_CONCAT(DISTINCT tm.position) as member_positions,
                GROUP_CONCAT(DISTINCT tm.club) as member_clubs,
                GROUP_CONCAT(DISTINCT u.name) as member_names,
                GROUP_CONCAT(u.avatar_url) as member_avatar_urls
            FROM entries e
            JOIN temporary_teams tt ON e.temp_team_id = tt.temp_team_id
            LEFT JOIN team_members tm ON tt.temp_team_id = tm.temp_team_id
            LEFT JOIN users u ON tm.user_id = u.id
            WHERE e.tournament_id = ?
            GROUP BY 
                tt.temp_team_id,
                tt.team_name,
                tt.club,
                tt.team_type,
                tt.team_gender,
                tt.avatar,
                tt.country,
                tt.state,
                tt.region,
                e.entry_date
        `, [tournament_id]);

        // Get individual entries
        const [individualEntries] = await connection.execute(`
            SELECT 
                NULL as team_id,
                u.name as team_name,
                NULL as club,
                'singles' as team_type,
                NULL as team_gender,
                u.avatar_url as avatar,
                u.country,
                u.state,
                u.region,
                'individual' as entry_type,
                e.entry_date,
                e.user_id as member_ids,
                NULL as member_positions,
                NULL as member_clubs
            FROM entries e
            JOIN users u ON e.user_id = u.id
            WHERE e.tournament_id = ? 
            AND e.team_id IS NULL 
            AND e.temp_team_id IS NULL
        `, [tournament_id]);

        // Process the entries to convert string lists to arrays of player objects
        const processEntries = (entries, entryType) => {
            return entries.map(entry => {
                const memberIds = entry.member_ids ? entry.member_ids.split(',').map(Number) : [];
                const memberPositions = entry.member_positions ? entry.member_positions.split(',') : [];
                const memberClubs = entry.member_clubs ? entry.member_clubs.split(',') : [];
                const memberNames = entry.member_names ? entry.member_names.split(',') : [];
                const memberAvatarUrls = entry.member_avatar_urls ? entry.member_avatar_urls.split(',') : [];

                const members = memberIds.map((id, index) => ({
                    user_id: id,
                    position: memberPositions[index] || null,
                    club: memberClubs[index] || null,
                    name: memberNames[index] || null,
                    avatar_url: memberAvatarUrls[index] || null
                }));

                // Determine entry category
                let entryCategory;
                if (entryType === 'individual') {
                    entryCategory = 'individual';
                } else if (entryType === 'temporary') {
                    entryCategory = 'one-off';
                } else {
                    entryCategory = 'team';
                }

                return {
                    ...entry,
                    members,
                    entry_category: entryCategory
                };
            });
        };

        // Combine and sort all entries by entry_date
        const allEntries = [
            ...processEntries(teamEntries, 'team'), 
            ...processEntries(tempTeamEntries, 'temporary'),
            ...processEntries(individualEntries, 'individual')
        ].sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "success",
                data: {
                    entries: allEntries
                }
            })
        };

    } catch (error) {
        console.error('Get tournament entries error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to get tournament entries",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
