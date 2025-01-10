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
        const body = JSON.parse(event.body);
        
        // First upload images if they exist
        let avatarImageUrl = null;
        let bannerImageUrl = null;
        
        if (body.avatar_base64) {
            try {
                const avatarResponse = await fetch('https://ieg3lhlyy0.execute-api.ap-southeast-2.amazonaws.com/Prod/upload-images', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        images: [{
                            image: body.avatar_base64,
                            filename: `avatar-${user_id}-${Date.now()}.jpg`
                        }]
                    })
                });
                
                const avatarData = await avatarResponse.json();
                console.log('Avatar Upload Response:', JSON.stringify(avatarData, null, 2));
                
                if (avatarData.status === 'success' && avatarData.data && avatarData.data[0]) {
                    avatarImageUrl = avatarData.data[0].variants.avatar;
                }
            } catch (error) {
                console.error('Error uploading avatar:', error);
            }
        }
        
        if (body.banner_base64) {
            try {
                const bannerResponse = await fetch('https://ieg3lhlyy0.execute-api.ap-southeast-2.amazonaws.com/Prod/upload-images', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        images: [{
                            image: body.banner_base64,
                            filename: `banner-${user_id}-${Date.now()}.jpg`
                        }]
                    })
                });
                
                const bannerData = await bannerResponse.json();
                console.log('Banner Upload Response:', JSON.stringify(bannerData, null, 2));
                
                if (bannerData.status === 'success' && bannerData.data && bannerData.data[0]) {
                    bannerImageUrl = bannerData.data[0].variants.thumbnail;
                }
            } catch (error) {
                console.error('Error uploading banner:', error);
            }
        }
        
        // Now proceed with database update using the new image URLs
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
                short_description = ?,
                avatar_url = COALESCE(?, avatar_url),
                banner_url = COALESCE(?, banner_url),
                country = ?,
                state = ?,
                region = ?,
                updated = NOW() 
            WHERE id = ?`,
            [
                body.name, 
                body.phone || null, 
                body.address || null, 
                body.description || null,
                body.short_description || null,
                avatarImageUrl,  // Only update if we have a new image
                bannerImageUrl,  // Only update if we have a new image
                body.country || null,
                body.state || null,
                body.region || null, 
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
                    body.sport || null, 
                    body.club || null, 
                    body.achievements ? JSON.stringify(body.achievements) : null, 
                    body.images ? JSON.stringify(body.images) : null,
                    body.gender || null,
                    user_id
                ]
            );
        } else if (userType === 'organiser') {
            await connection.execute(
                `UPDATE organisers_data SET 
                    club = ?, 
                    achievements = ?, 
                    images = ?,
                    organiser_type = ?,
                    bank_name = ?,
                    account_name = ?,
                    bsb = ?,
                    account_number = ?,
                    club_id = ?
                WHERE user_id = ?`,
                [
                    body.club || null, 
                    body.achievements ? JSON.stringify(body.achievements) : null, 
                    body.images ? JSON.stringify(body.images) : null,
                    body.organiser_type || null,
                    body.bank_name || null,
                    body.account_name || null,
                    body.bsb || null,
                    body.account_number || null,
                    body.club_id || null,
                    user_id
                ]
            );
        }

        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                status: "success",
                message: "Profile updated successfully",
                data: {
                    avatar_url: avatarImageUrl,
                    banner_url: bannerImageUrl
                }
            })
        };

    } catch (error) {
        console.error('Error updating profile:', error);
        return {
            statusCode: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to update profile"
            })
        };
    } finally {
        if (connection) await connection.end();
    }
};
