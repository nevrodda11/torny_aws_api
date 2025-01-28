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

exports.createPlayerAchievementHandler = async (event, context) => {
    let connection;
    
    try {
        const body = JSON.parse(event.body);
        const { 
            entity_id,
            entity_type,
            title,
            description,
            date_achieved,
            type,
            gender,
            award_level,
            images,
            city,
            state,
            country,
            result: achievementResult
        } = body;

        // Validate required fields
        if (!entity_id || !title || !date_achieved || !entity_type) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Missing required fields: entity_id, entity_type, title, and date_achieved are required'
                })
            };
        }

        // Connect to database
        connection = await mysql.createConnection(connectionConfig);

        // Verify entity exists based on type
        let entityCheckQuery;
        if (entity_type === 'player') {
            entityCheckQuery = 'SELECT user_id FROM players_data WHERE user_id = ?';
        } else if (entity_type === 'club') {
            entityCheckQuery = 'SELECT club_id FROM clubs WHERE club_id = ?';
        } else if (entity_type === 'team') {
            entityCheckQuery = 'SELECT team_id FROM teams WHERE team_id = ?';
        } else if (entity_type === 'organiser') {
            entityCheckQuery = 'SELECT organiser_id FROM organisers WHERE organiser_id = ?';
        } else if (entity_type === 'association') {
            entityCheckQuery = 'SELECT association_id FROM associations WHERE association_id = ?';
        } else {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Invalid entity_type'
                })
            };
        }

        const [entities] = await connection.execute(entityCheckQuery, [entity_id]);

        if (entities.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: `${entity_type} not found`
                })
            };
        }

        // Insert achievement first to get the ID
        const [result] = await connection.execute(
            `INSERT INTO achievements (
                entity_id,
                entity_type,
                title,
                description,
                date_achieved,
                type,
                gender,
                award_level,
                city,
                state,
                country,
                result
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entity_id,
                entity_type,
                title,
                description || null,
                date_achieved,
                type || null,
                gender || null,
                award_level || null,
                city || null,
                state || null,
                country || null,
                achievementResult || null
            ]
        );

        const achievement_id = result.insertId;
        const uploadedImages = [];

        // Upload images if provided
        if (images && images.length > 0) {
            for (const imageData of images) {
                try {
                    // Upload to Cloudflare
                    const uploadResponse = await fetch('https://ieg3lhlyy0.execute-api.ap-southeast-2.amazonaws.com/Prod/upload-images', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            images: [{
                                image: imageData.image_base64,
                                filename: `achievement-${achievement_id}-${Date.now()}.jpg`
                            }]
                        })
                    });

                    const uploadData = await uploadResponse.json();
                    
                    if (uploadData.status === 'success' && uploadData.data && uploadData.data[0]) {
                        const baseUrl = uploadData.data[0].url;
                        const publicUrl = `${baseUrl}/public`;
                        const avatarUrl = `${baseUrl}/avatar`;
                        const thumbnailUrl = `${baseUrl}/thumbnail`;

                        // Insert image record
                        const [imageResult] = await connection.execute(
                            `INSERT INTO torny_db.images (
                                achievement_id,
                                ${entity_type === 'player' ? 'user_id' : 'team_id'},
                                cloudflare_image_id,
                                public_url,
                                avatar_url,
                                thumbnail_url
                            ) VALUES (?, ?, ?, ?, ?, ?)`,
                            [
                                achievement_id,
                                entity_id,
                                uploadData.data[0].id,
                                publicUrl,
                                avatarUrl,
                                thumbnailUrl
                            ]
                        );

                        uploadedImages.push({
                            image_id: imageResult.insertId,
                            cloudflare_image_id: uploadData.data[0].id,
                            public_url: publicUrl,
                            avatar_url: avatarUrl,
                            thumbnail_url: thumbnailUrl
                        });
                    }
                } catch (error) {
                    console.error('Error uploading image:', error);
                }
            }
        }

        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                data: {
                    achievement_id,
                    entity_id,
                    entity_type,
                    title,
                    description,
                    date_achieved,
                    type,
                    gender,
                    award_level,
                    images: uploadedImages,
                    city,
                    state,
                    country,
                    result: achievementResult
                }
            })
        };

    } catch (error) {
        console.error('Error creating achievement:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'error',
                message: 'Internal server error'
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
