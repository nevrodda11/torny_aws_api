const mysql = require('mysql2/promise');

const validateEnvVars = () => {
    console.log('Starting environment variable validation');
    const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
    const missing = required.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
        console.error('Missing environment variables:', missing);
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    console.log('Environment validation successfull');
};

const connectionConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

exports.updateProfileHandler = async (event, context) => {
    let connection = null;
    try {
        validateEnvVars();
        const { user_id } = event.pathParameters;
        const { 
            // Common fields (users table)
            name, 
            phone, 
            address, 
            description, 
            avatar_url,
            country,
            state,
            region,
            
            // Type-specific fields
            sport,      // players only
            club,       // both players and organisers
            achievements, 
            images,
            gender      // players only
        } = JSON.parse(event.body);
        
        connection = await mysql.createConnection(connectionConfig);

        // First, get the user's type
        const [userRows] = await connection.execute(
            'SELECT user_type FROM users WHERE id = ?',
            [user_id]
        );

        if (userRows.length === 0) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: "error",
                    message: "User not found"
                })
            };
        }

        const userType = userRows[0].user_type;
        
        // Update users table with common fields
        await connection.execute(
            `UPDATE users SET 
                name = ?, 
                phone = ?, 
                address = ?, 
                description = ?, 
                avatar_url = ?,
                country = ?,
                state = ?,
                region = ?,
                updated = NOW() 
            WHERE id = ?`,
            [
                name, 
                phone || null, 
                address || null, 
                description || null, 
                avatar_url || null,
                country || null,
                state || null,
                region || null, 
                user_id
            ]
        );

        // Update type-specific data
        if (userType === 'player') {
            await connection.execute(
                `UPDATE players_data SET 
                    sport = ?, 
                    club = ?, 
                    achievements = ?, 
                    images = ?,
                    gender = ?
                WHERE user_id = ?`,
                [
                    sport || null, 
                    club || null, 
                    achievements ? JSON.stringify(achievements) : null, 
                    images ? JSON.stringify(images) : null,
                    gender || null,
                    user_id
                ]
            );
        } else if (userType === 'organiser') {
            await connection.execute(
                `UPDATE organisers_data SET 
                    club = ?, 
                    achievements = ?, 
                    images = ? 
                WHERE user_id = ?`,
                [
                    club || null, 
                    achievements ? JSON.stringify(achievements) : null, 
                    images ? JSON.stringify(images) : null, 
                    user_id
                ]
            );
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: "success",
                message: "Profile updated successfully"
            })
        };

    } catch (error) {
        console.error('Error updating profile:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: "error",
                message: "Failed to update profile"
            })
        };
    } finally {
        if (connection) await connection.end();
    }
};
