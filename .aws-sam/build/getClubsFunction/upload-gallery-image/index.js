const mysql = require('mysql2/promise');
const fetch = require('node-fetch');

const connectionConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false }
};

exports.uploadGalleryImageHandler = async (event, context) => {
    let connection;
    
    try {
        const body = JSON.parse(event.body);
        const { 
            user_id,
            team_id,
            image_base64,
            caption,
            filename = `gallery-${Date.now()}.jpg`
        } = body;

        // Validate required fields
        if (!image_base64 || (!user_id && !team_id)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Required fields missing: image_base64 and either user_id or team_id'
                })
            };
        }

        // Upload image to Cloudflare using existing endpoint
        const uploadResponse = await fetch('https://ieg3lhlyy0.execute-api.ap-southeast-2.amazonaws.com/Prod/upload-images', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                images: [{
                    image: image_base64,
                    filename: filename
                }]
            })
        });

        const uploadData = await uploadResponse.json();
        console.log('Cloudflare upload response:', JSON.stringify(uploadData, null, 2));
        
        if (uploadData.status !== 'success' || !uploadData.data || !uploadData.data[0]) {
            console.error('Cloudflare upload failed:', uploadData);
            throw new Error(`Failed to upload image to Cloudflare: ${JSON.stringify(uploadData)}`);
        }

        // Connect to database
        connection = await mysql.createConnection(connectionConfig);

        // Verify user exists if user_id is provided
        if (user_id) {
            const [users] = await connection.execute(
                'SELECT id FROM torny_db.users WHERE id = ?',
                [user_id]
            );

            if (users.length === 0) {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: 'error',
                        message: `User with ID ${user_id} not found`
                    })
                };
            }
        }

        // Verify team exists if team_id is provided
        if (team_id) {
            const [teams] = await connection.execute(
                'SELECT team_id FROM torny_db.teams WHERE team_id = ?',
                [team_id]
            );

            if (teams.length === 0) {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: 'error',
                        message: `Team with ID ${team_id} not found`
                    })
                };
            }
        }

        // Construct the URLs by appending the appropriate suffixes
        const baseUrl = uploadData.data[0].url;  // Get the base URL from Cloudflare
        const publicUrl = `${baseUrl}/public`;
        const avatarUrl = `${baseUrl}/avatar`;
        const thumbnailUrl = `${baseUrl}/thumbnail`;

        // Insert into images table with constructed URLs
        const [result] = await connection.execute(
            `INSERT INTO torny_db.images (
                user_id,
                team_id,
                cloudflare_image_id,
                caption,
                public_url,
                avatar_url,
                thumbnail_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                user_id || null,
                team_id || null,
                uploadData.data[0].id,
                caption || null,
                publicUrl,      // public version
                avatarUrl,      // avatar version
                thumbnailUrl    // thumbnail version
            ]
        );

        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: {
                    image_id: result.insertId,
                    user_id: user_id || null,
                    team_id: team_id || null,
                    cloudflare_image_id: uploadData.data[0].id,
                    public_url: publicUrl,
                    avatar_url: avatarUrl,
                    thumbnail_url: thumbnailUrl,
                    caption: caption || null,
                    created_at: new Date().toISOString()
                }
            })
        };

    } catch (error) {
        console.error('Error uploading gallery image:', error);
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