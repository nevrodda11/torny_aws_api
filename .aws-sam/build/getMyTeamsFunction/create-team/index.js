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

        const { 
            team_name, 
            sport_id, 
            team_members = [], 
            created_by_user_id, 
            team_type,
            team_gender,
            country,
            state,
            region,
            avatar_base64,
            main_image_base64,
            club
        } = JSON.parse(event.body);

        // Validate required fields
        if (!team_name || !sport_id || !created_by_user_id || !team_type || !team_gender) {
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

        let avatarUrl = null;
        let mainImageUrl = null;

        // Upload avatar if provided
        if (avatar_base64) {
            try {
                const avatarResponse = await fetch('https://ieg3lhlyy0.execute-api.ap-southeast-2.amazonaws.com/Prod/upload-images', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        images: [{
                            image: avatar_base64,
                            filename: `team-avatar-${Date.now()}.jpg`
                        }]
                    })
                });
                
                const avatarData = await avatarResponse.json();
                console.log('Avatar Upload Response:', JSON.stringify(avatarData, null, 2));
                
                if (avatarData.status === 'success' && avatarData.data && avatarData.data[0]) {
                    avatarUrl = `${avatarData.data[0].url}/avatar`;
                }
            } catch (error) {
                console.error('Error uploading avatar:', error);
            }
        }

        // Upload main image if provided
        if (main_image_base64) {
            try {
                const mainImageResponse = await fetch('https://ieg3lhlyy0.execute-api.ap-southeast-2.amazonaws.com/Prod/upload-images', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        images: [{
                            image: main_image_base64,
                            filename: `team-main-${Date.now()}.jpg`
                        }]
                    })
                });
                
                const mainImageData = await mainImageResponse.json();
                console.log('Main Image Upload Response:', JSON.stringify(mainImageData, null, 2));
                
                if (mainImageData.status === 'success' && mainImageData.data && mainImageData.data[0]) {
                    mainImageUrl = `${mainImageData.data[0].url}/public`;
                }
            } catch (error) {
                console.error('Error uploading main image:', error);
            }
        }

        // Insert the team with image URLs
        const [result] = await connection.execute(
            `INSERT INTO teams (
                team_name, 
                sport_id, 
                created_by_user_id, 
                team_type,
                team_gender,
                country,
                state,
                region,
                avatar,
                main_image,
                club
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                team_name, 
                sport_id, 
                created_by_user_id, 
                team_type,
                team_gender,
                country || null,
                state || null,
                region || null,
                avatarUrl,
                mainImageUrl,
                club || null
            ]
        );

        const teamId = result.insertId;

        // Add the creator as an approved team member with position and club
        await connection.execute(
            'INSERT INTO team_members (team_id, user_id, status, position, club) VALUES (?, ?, ?, ?, ?)',
            [
                teamId, 
                created_by_user_id, 
                'approved', 
                team_members.find(m => m.user_id === created_by_user_id)?.position || null,
                team_members.find(m => m.user_id === created_by_user_id)?.club || null
            ]
        );

        // Add additional team members with pending status, position and club
        if (team_members.length > 0) {
            const values = team_members
                .filter(member => member.user_id !== created_by_user_id)
                .map(member => [
                    teamId, 
                    member.user_id, 
                    'pending', 
                    member.position || null,
                    member.club || null
                ]);
            
            if (values.length > 0) {
                await connection.query(
                    'INSERT INTO team_members (team_id, user_id, status, position, club) VALUES ?',
                    [values]
                );
            }
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
                        'avatar_url', u.avatar_url,
                        'status', tm.status,
                        'position', tm.position,
                        'club', tm.club
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