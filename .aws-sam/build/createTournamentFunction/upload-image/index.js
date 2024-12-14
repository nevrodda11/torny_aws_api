const AWS = require('aws-sdk');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

exports.uploadImageHandler = async (event) => {
    console.log('Starting uploadImageHandler with event:', JSON.stringify(event));
    try {
        // Parse the request body
        console.log('Parsing request body...');
        const body = JSON.parse(event.body);
        console.log('Parsed body:', JSON.stringify(body));
        const { images, userId } = body;
        console.log('Extracted userId:', userId);
        console.log('Number of images:', images?.length);

        // Validate userId
        if (!userId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'error',
                    message: 'userId is required'
                })
            };
        }

        // Process each image
        console.log('Starting to process images...');
        const uploadResults = await Promise.all(
            images.map(async (img, index) => {
                console.log(`Processing image ${index + 1}/${images.length}`);
                try {
                    // Validate file type
                    console.log('Validating file type:', img.contentType);
                    if (!ALLOWED_TYPES.includes(img.contentType)) {
                        console.log('Invalid file type:', img.contentType);
                        return {
                            status: 'error',
                            message: 'Invalid file type',
                            originalName: img.name
                        };
                    }

                    const url = await processAndUploadImage(img.data, img.contentType, userId);
                    console.log(`Successfully processed image ${index + 1}`);
                    return {
                        status: 'success',
                        url,
                        originalName: img.name
                    };
                } catch (error) {
                    console.error(`Error processing image ${index + 1}:`, error);
                    return {
                        status: 'error',
                        message: error.message,
                        originalName: img.name
                    };
                }
            })
        );

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'success',
                data: {
                    uploads: uploadResults
                }
            })
        };

    } catch (error) {
        console.error('Handler error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'error',
                message: 'Internal server error',
                details: error.message
            })
        };
    }
};

async function processAndUploadImage(imageData, contentType, userId) {
    try {
        // Decode base64 image
        const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64');

        // Process image with Sharp
        const processedImage = await sharp(buffer)
            .resize(800, 800, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })
            .toBuffer();
            
        // Generate unique filename and path
        const filename = `${uuidv4()}.jpg`;
        const key = `users/${userId}/images/${filename}`;

        // Upload to S3
        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: processedImage,
            ContentType: 'image/jpeg',
            ACL: 'public-read'
        }).promise();

        return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
    } catch (error) {
        console.error('Image processing error:', error);
        throw new Error(`Image processing failed: ${error.message}`);
    }
}
