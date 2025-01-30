const mysql = require('mysql2/promise');
const fetch = require('node-fetch');

exports.uploadVideoHandler = async (event, context) => {
    let connection;
    
    try {
        console.log('Environment variables:', {
            accountId: process.env.CLOUDFLARE_ACCOUNT_ID ? 'Set' : 'Not set',
            streamToken: process.env.CLOUDFLARE_STREAM_TOKEN ? 'Set' : 'Not set'
        });

        const body = JSON.parse(event.body);
        const { 
            entity_type,    // 'user', 'team', 'organisation', or 'club'
            entity_id,      // the ID of the owner
            achievement_id, // optional
            chunk_index,    // current chunk number
            total_chunks,   // total number of chunks
            chunk_data,     // base64 chunk data
            title,
            caption,
            filename = `video-${Date.now()}.mp4`
        } = body;

        // Validate required fields
        if (!chunk_data || !entity_type || !entity_id || chunk_index === undefined || !total_chunks) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Required fields missing'
                })
            };
        }

        // At the start of the function
        console.log('Upload request details:', {
            chunkIndex: chunk_index,
            totalChunks: total_chunks,
            isSingleChunk: total_chunks === 1,
            dataSize: chunk_data.length
        });

        // If this is the first chunk, initiate the upload with Cloudflare
        if (chunk_index === 0) {
            try {
                console.log('Initializing upload with Cloudflare...', {
                    isSingleChunk: total_chunks === 1,
                    totalSize: chunk_data.length * total_chunks
                });
                
                // Calculate total size from chunk size and total chunks
                const totalSize = chunk_data.length * total_chunks;
                
                const initResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.CLOUDFLARE_STREAM_TOKEN}`,
                        'Content-Type': 'application/json',
                        'Tus-Resumable': '1.0.0',
                        'Upload-Length': totalSize.toString(),
                        'Upload-Metadata': `filename ${Buffer.from(filename).toString('base64')}`
                    }
                });

                console.log('Cloudflare init response status:', initResponse.status);
                const responseText = await initResponse.text();
                console.log('Cloudflare init response:', responseText);

                if (!initResponse.ok) {
                    throw new Error(`Failed to initialize upload: ${responseText}`);
                }

                const uploadUrl = initResponse.headers.get('Location');
                if (!uploadUrl) {
                    throw new Error('No upload URL received from Cloudflare');
                }

                // If this is a single chunk upload, send it immediately
                if (total_chunks === 1) {
                    console.log('Processing single chunk upload...');
                    
                    // Ensure chunk size is a multiple of 256KiB (262144 bytes)
                    const chunkData = Buffer.from(chunk_data, 'base64');
                    const minChunkSize = 5242880; // 5MB minimum
                    const blockSize = 262144; // 256KiB blocks
                    
                    // Calculate padding to reach minimum size and ensure it's a multiple of 256KiB
                    const paddingSize = Math.max(
                        minChunkSize - chunkData.length,
                        blockSize - (chunkData.length % blockSize)
                    );
                    
                    const paddedData = Buffer.alloc(chunkData.length + paddingSize);
                    chunkData.copy(paddedData);
                    
                    console.log('Chunk size details:', {
                        originalSize: chunkData.length,
                        paddedSize: paddedData.length,
                        minRequired: minChunkSize,
                        paddingAdded: paddingSize,
                        isValidSize: paddedData.length >= minChunkSize && paddedData.length % blockSize === 0
                    });

                    try {
                        console.log('Sending padded chunk to Cloudflare...');
                        const uploadResponse = await fetch(uploadUrl, {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${process.env.CLOUDFLARE_STREAM_TOKEN}`,
                                'Content-Type': 'application/offset+octet-stream',
                                'Upload-Offset': '0',
                                'Tus-Resumable': '1.0.0'
                            },
                            body: paddedData
                        }).catch(error => {
                            console.error('Fetch error:', error);
                            throw error;
                        });

                        console.log('Received response from Cloudflare');
                        const responseHeaders = Object.fromEntries(uploadResponse.headers.entries());
                        console.log('Single chunk upload response:', {
                            status: uploadResponse.status,
                            headers: responseHeaders,
                            streamMediaId: responseHeaders['stream-media-id']
                        });

                        // Get response text for error details
                        const responseText = await uploadResponse.text().catch(error => {
                            console.error('Error reading response text:', error);
                            return 'Failed to read response text';
                        });
                        console.log('Upload response body:', responseText);

                        if (!uploadResponse.ok) {
                            throw new Error(`Failed to upload video chunk to Cloudflare. Status: ${uploadResponse.status}, Response: ${responseText}`);
                        }

                        // Get video metadata and store in database
                        const videoId = responseHeaders['stream-media-id'];
                        const videoData = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${videoId}`, {
                            headers: {
                                'Authorization': `Bearer ${process.env.CLOUDFLARE_STREAM_TOKEN}`
                            }
                        }).then(res => res.json());

                        console.log('Video metadata from Cloudflare:', {
                            status: videoData.result.status,
                            playback: videoData.result.playback,
                            thumbnail: videoData.result.thumbnail,
                            duration: videoData.result.duration,
                            dimensions: {
                                width: videoData.result.input.width,
                                height: videoData.result.input.height
                            }
                        });

                        // Store in database with SSL
                        connection = await mysql.createConnection({
                            host: process.env.DB_HOST,
                            user: process.env.DB_USER,
                            password: process.env.DB_PASSWORD,
                            database: process.env.DB_NAME,
                            ssl: {
                                rejectUnauthorized: true
                            }
                        });

                        let ownerColumn;
                        switch(entity_type) {
                            case 'user': ownerColumn = 'user_id'; break;
                            case 'team': ownerColumn = 'team_id'; break;
                            case 'organisation': ownerColumn = 'organisation_id'; break;
                            case 'club': ownerColumn = 'club_id'; break;
                            default: throw new Error('Invalid entity_type');
                        }

                        // Map Cloudflare status to our database status
                        let dbStatus = 'pending';
                        if (videoData.result.status.state === 'ready') dbStatus = 'ready';
                        else if (videoData.result.status.state === 'error') dbStatus = 'error';

                        const [result] = await connection.execute(
                            `INSERT INTO torny_db.videos (
                                ${ownerColumn},
                                achievement_id,
                                cloudflare_video_id,
                                title,
                                caption,
                                playback_url,
                                thumbnail_url,
                                duration,
                                width,
                                height,
                                status,
                                processing_status
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                entity_id,
                                achievement_id || null,
                                videoId,
                                title || null,
                                caption || null,
                                videoData.result.playback.hls,
                                videoData.result.thumbnail,
                                videoData.result.duration > 0 ? videoData.result.duration : null,
                                videoData.result.input.width > 0 ? videoData.result.input.width : null,
                                videoData.result.input.height > 0 ? videoData.result.input.height : null,
                                dbStatus,
                                videoData.result.status.state || 'processing'
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
                                video_id: result.insertId,
                                cloudflare_id: videoId,
                                playback_url: videoData.result.playback.hls
                            })
                        };
                    } catch (error) {
                        console.error('Database connection error:', error);
                        throw error;
                    }
                }

                // For multi-chunk uploads, return the upload URL
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: 'success',
                        upload_url: uploadUrl
                    })
                };
            } catch (error) {
                console.error('Cloudflare initialization error:', error);
                throw error;
            }
        }

        // For subsequent chunks, upload to the provided URL
        if (body.upload_url) {
            try {
                console.log('Received subsequent chunk request:', {
                    chunkIndex: chunk_index,
                    totalChunks: total_chunks,
                    hasUploadUrl: !!body.upload_url,
                    uploadUrl: body.upload_url
                });

                const uploadResponse = await fetch(body.upload_url, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${process.env.CLOUDFLARE_STREAM_TOKEN}`,
                        'Content-Type': 'application/offset+octet-stream',
                        'Upload-Offset': (chunk_index * chunk_data.length).toString(),
                        'Tus-Resumable': '1.0.0'
                    },
                    body: Buffer.from(chunk_data, 'base64')
                });

                const responseHeaders = Object.fromEntries(uploadResponse.headers.entries());
                console.log('Cloudflare chunk upload response:', {
                    chunkIndex: chunk_index,
                    status: uploadResponse.status,
                    headers: responseHeaders,
                    uploadOffset: responseHeaders['upload-offset'],
                    streamMediaId: responseHeaders['stream-media-id']
                });

                // If this is the final chunk and upload is successful
                if (chunk_index === total_chunks - 1 && uploadResponse.ok) {
                    console.log('Final chunk upload complete:', {
                        chunkIndex: chunk_index,
                        totalChunks: total_chunks,
                        videoId: responseHeaders['stream-media-id']
                    });
                    // Get video metadata from Cloudflare
                    const videoId = responseHeaders['stream-media-id'];
                    const videoData = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${videoId}`, {
                        headers: {
                            'Authorization': `Bearer ${process.env.CLOUDFLARE_STREAM_TOKEN}`
                        }
                    }).then(res => res.json());

                    // Store in database
                    connection = await mysql.createConnection({
                        host: process.env.DB_HOST,
                        user: process.env.DB_USER,
                        password: process.env.DB_PASSWORD,
                        database: process.env.DB_NAME
                    });

                    let ownerColumn;
                    switch(entity_type) {
                        case 'user': ownerColumn = 'user_id'; break;
                        case 'team': ownerColumn = 'team_id'; break;
                        case 'organisation': ownerColumn = 'organisation_id'; break;
                        case 'club': ownerColumn = 'club_id'; break;
                        default: throw new Error('Invalid entity_type');
                    }

                    // Map Cloudflare status to our database status
                    let dbStatus = 'pending';
                    if (videoData.result.status.state === 'ready') dbStatus = 'ready';
                    else if (videoData.result.status.state === 'error') dbStatus = 'error';

                    const [result] = await connection.execute(
                        `INSERT INTO torny_db.videos (
                            ${ownerColumn},
                            achievement_id,
                            cloudflare_video_id,
                            title,
                            caption,
                            playback_url,
                            thumbnail_url,
                            duration,
                            width,
                            height,
                            status,
                            processing_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            entity_id,
                            achievement_id || null,
                            videoId,
                            title || null,
                            caption || null,
                            videoData.result.playback.hls,
                            videoData.result.thumbnail,
                            videoData.result.duration > 0 ? videoData.result.duration : null,
                            videoData.result.input.width > 0 ? videoData.result.input.width : null,
                            videoData.result.input.height > 0 ? videoData.result.input.height : null,
                            dbStatus,
                            videoData.result.status.state || 'processing'
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
                            video_id: result.insertId
                        })
                    };
                } else {
                    console.log('Intermediate chunk upload complete:', {
                        chunkIndex: chunk_index,
                        totalChunks: total_chunks,
                        nextExpectedChunk: chunk_index + 1
                    });
                }

                // For intermediate chunks, just return success
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: 'success',
                        message: 'Chunk uploaded successfully'
                    })
                };
            } catch (error) {
                console.error('Error uploading chunk to Cloudflare:', error);
                throw error;
            }
        }

    } catch (error) {
        console.error('Error uploading video:', error);
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
