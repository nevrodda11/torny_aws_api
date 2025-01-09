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

exports.deleteGalleryImageHandler = async (event, context) => {
    let connection;
    
    try {
        // Check required environment variables
        if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
            throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable is not set');
        }
        if (!process.env.CLOUDFLARE_API_TOKEN) {
            throw new Error('CLOUDFLARE_API_TOKEN environment variable is not set');
        }

        const { image_id } = JSON.parse(event.body);
        console.log('Attempting to delete image with ID:', image_id);

        if (!image_id) {
            console.log('No image_id provided in request body');
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'image_id is required'
                })
            };
        }

        // Connect to database
        console.log('Connecting to database...');
        connection = await mysql.createConnection(connectionConfig);

        // Get Cloudflare image ID before deleting from database
        console.log('Querying database for image record...');
        const [imageRecord] = await connection.execute(
            'SELECT cloudflare_image_id FROM torny_db.images WHERE image_id = ?',
            [image_id.toString()]
        );
        console.log('Database query result:', imageRecord);

        if (!imageRecord || imageRecord.length === 0) {
            console.log('No image found in database with ID:', image_id);
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'Image not found'
                })
            };
        }

        console.log('Found image record:', imageRecord[0]);

        // Delete from Cloudflare
        const cloudflareUrl = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/images/v1/${imageRecord[0].cloudflare_image_id}`;
        console.log('Attempting to delete from Cloudflare:', cloudflareUrl);
        
        const cloudflareResponse = await fetch(
            cloudflareUrl,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`
                }
            }
        );

        console.log('Cloudflare response status:', cloudflareResponse.status);
        
        if (!cloudflareResponse.ok) {
            const errorData = await cloudflareResponse.json();
            console.error('Cloudflare deletion failed:', errorData);
            throw new Error(`Failed to delete image from Cloudflare: ${JSON.stringify(errorData)}`);
        }

        const cloudflareData = await cloudflareResponse.json();
        console.log('Cloudflare deletion response:', cloudflareData);

        // Delete from database
        console.log('Deleting from database...');
        const [deleteResult] = await connection.execute(
            'DELETE FROM torny_db.images WHERE image_id = ?',
            [image_id.toString()]
        );
        console.log('Database deletion result:', deleteResult);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'success',
                message: 'Image deleted successfully'
            })
        };

    } catch (error) {
        console.error('Error deleting gallery image:', error);
        console.error('Stack trace:', error.stack);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: 'error',
                message: 'Internal server error',
                details: error.message,
                stack: error.stack
            })
        };
    } finally {
        if (connection) {
            console.log('Closing database connection');
            await connection.end();
        }
    }
};
