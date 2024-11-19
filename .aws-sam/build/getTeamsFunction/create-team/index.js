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

exports.createTeamHandler = async (event, context) => {
    console.log('Processing create team request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        connection = await mysql.createConnection(connectionConfig);
        await connection.beginTransaction();
        console.log('MySQL connection successful');

        const { team_name, sport_id, team_members = [], created_by_user_id } = JSON.parse(event.body);

        // Validate required fields
        if (!team_name || !sport_id || !created_by_user_id) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Missing required fields"
                })
            };
        }

        // Insert the team
        const [result] = await connection.execute(
            'INSERT INTO teams (team_name, sport_id, created_by_user_id) VALUES (?, ?, ?)',
            [team_name, sport_id, created_by_user_id]
        );

        const teamId = result.insertId;

        // Add the creator as a team member
        await connection.execute(
            'INSERT INTO team_members (team_id, user_id) VALUES (?, ?)',
            [teamId, created_by_user_id]
        );

        // Add additional team members
        if (team_members.length > 0) {
            const values = team_members.map(member_id => [teamId, member_id]);
            await connection.query(
                'INSERT INTO team_members (team_id, user_id) VALUES ?',
                [values]
            );
        }

        await connection.commit();

        // Fetch the created team with member details
        const [teams] = await connection.execute(`
            SELECT 
                t.*,
                COUNT(tm.user_id) as member_count,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'user_id', u.id,
                        'name', u.name,
                        'avatar_url', u.avatar_url
                    )
                ) as team_members
            FROM teams t
            LEFT JOIN team_members tm ON t.team_id = tm.team_id
            LEFT JOIN users u ON tm.user_id = u.id
            WHERE t.team_id = ?
            GROUP BY t.team_id
        `, [teamId]);

        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "success",
                message: "Team created successfully",
                data: teams[0]
            })
        };

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Create team error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to create team",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}; 