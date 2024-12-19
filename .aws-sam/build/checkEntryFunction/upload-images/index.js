const fetch = require('node-fetch');
const FormData = require('form-data');

const validateEnvVars = () => {
    console.log('Starting environment variable validation');
    const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
    const missing = required.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
        console.error('Missing environment variables:', missing);
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    console.log('Environment validation successful');
};

// Helper function to validate and clean base64 string
function cleanBase64String(base64String) {
    // Remove data URI prefix if present
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    
    // Check if the string is valid base64
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
        throw new Error('Invalid base64 string');
    }
    
    return base64Data;
}

async function uploadSingleImage(image, filename) {
    try {
        const base64Data = cleanBase64String(image);
        const buffer = Buffer.from(base64Data, 'base64');
        
        const formData = new FormData();
        formData.append('file', buffer, {
            filename,
            contentType: 'image/jpeg'  // or detect from the original image
        });

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/images/v1`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`
                },
                body: formData
            }
        );

        const result = await response.json();
        if (!result.success) {
            console.error(`Upload failed for ${filename}:`, result.errors);
            throw new Error(`Upload failed for ${filename}`);
        }

        // Construct the delivery URL with the correct format
        const baseDeliveryUrl = 'https://imagedelivery.net/m72F7lhvPE70s0P_bHotiw';
        
        return {
            id: result.result.id,
            url: `${baseDeliveryUrl}/${result.result.id}`, // Base URL without variant
            variants: {
                public: `${baseDeliveryUrl}/${result.result.id}/public`,
                thumbnail: `${baseDeliveryUrl}/${result.result.id}/thumbnail`
            },
            filename: filename
        };
    } catch (error) {
        console.error(`Error processing ${filename}:`, error);
        throw error;
    }
}

exports.uploadImagesHandler = async (event, context) => {
    console.log('Processing image upload request');
    console.log('Event:', JSON.stringify(event));

    try {
        validateEnvVars();

        // Parse the request body
        const body = JSON.parse(event.body);
        const { images } = body;

        if (!images || !Array.isArray(images) || images.length === 0) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Missing or invalid images array"
                })
            };
        }

        // Upload all images in parallel
        const uploadPromises = images.map(img => {
            if (!img.image || !img.filename) {
                throw new Error(`Invalid image object. Both 'image' and 'filename' are required`);
            }
            console.log('Base64 string length:', img.image.length);
            console.log('First 100 chars:', img.image.substring(0, 100));
            console.log('Last 100 chars:', img.image.substring(img.image.length - 100));
            return uploadSingleImage(img.image, img.filename);
        });

        const results = await Promise.all(uploadPromises);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "success",
                data: results
            })
        };

    } catch (error) {
        console.error('Image upload errorr:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to process image upload",
                details: error.message
            })
        };
    }
};
