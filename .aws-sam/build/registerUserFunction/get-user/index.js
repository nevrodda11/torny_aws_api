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
    ssl: { rejectUnauthorized: false }
};

exports.getUserHandler = async (event, context) => {
    let connection = null;
    try {
        validateEnvVars();
        const { user_id } = event.pathParameters;
        
        connection = await mysql.createConnection(connectionConfig);

        // First get user type
        const [userTypeResult] = await connection.execute(
            'SELECT user_type FROM users WHERE id = ?',
            [user_id]
        );

        if (userTypeResult.length === 0) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: "error",
                    message: "User not found"
                })
            };
        }

        const userType = userTypeResult[0].user_type;
        let userData;

        if (userType === 'player') {
            const [rows] = await connection.execute(
                `SELECT 
                    u.id, u.user_type, u.name as user_name, u.email, u.phone, 
                    u.address, u.description as user_description, 
                    u.short_description,
                    u.avatar_url, u.banner_url, u.created, u.updated,
                    u.country as user_country, u.state as user_state, u.region as user_region,
                    p.sport, p.club, p.club_id, p.achievements, p.images, p.gender,
                    c.name as club_name, c.description as club_description, 
                    c.avatar, c.banner_image,
                    c.country as club_country, c.state as club_state, c.region as club_region,
                    c.created as club_created
                 FROM users u 
                 LEFT JOIN players_data p ON u.id = p.user_id 
                 LEFT JOIN clubs_data c ON p.club_id = c.club_id
                 WHERE u.id = ?`,
                [user_id]
            );
            userData = rows[0];
            
            // Rename user fields back to their original names
            userData.name = userData.user_name;
            userData.description = userData.user_description;
            userData.country = userData.user_country;
            userData.state = userData.user_state;
            userData.region = userData.user_region;
            delete userData.user_name;
            delete userData.user_description;
            delete userData.user_country;
            delete userData.user_state;
            delete userData.user_region;

            // Handle achievements and images based on their type
            userData.achievements = Array.isArray(userData.achievements) 
                ? userData.achievements 
                : (userData.achievements ? JSON.parse(userData.achievements) : []);
                
            userData.images = Array.isArray(userData.images) 
                ? userData.images 
                : (userData.images ? JSON.parse(userData.images) : []);

            // Format club data into a nested object if club exists
            if (userData.club_id) {
                userData.club_data = {
                    id: userData.club_id,
                    name: userData.club_name,
                    description: userData.club_description,
                    avatar: userData.avatar,
                    banner_image: userData.banner_image,
                    country: userData.club_country,
                    state: userData.club_state,
                    region: userData.club_region,
                    created: userData.club_created
                };

                // Remove the flat club fields
                delete userData.club_id;
                delete userData.club_name;
                delete userData.club_description;
                delete userData.avatar;
                delete userData.banner_image;
                delete userData.club_country;
                delete userData.club_state;
                delete userData.club_region;
                delete userData.club_created;
            }
        } else {
            const [rows] = await connection.execute(
                `SELECT 
                    u.id,
                    u.user_type,
                    u.name,
                    u.email,
                    u.phone,
                    u.address,
                    u.description,
                    u.short_description,
                    u.avatar_url,
                    u.banner_url,
                    u.created,
                    u.updated,
                    u.country,
                    u.state,
                    u.region,
                    o.club,
                    o.achievements,
                    o.images,
                    o.organiser_type,
                    o.bank_name,
                    o.account_name,
                    o.bsb,
                    o.account_number
                 FROM users u 
                 LEFT JOIN organisers_data o ON u.id = o.user_id 
                 WHERE u.id = ?`,
                [user_id]
            );
            userData = rows[0];
            
            // Handle achievements and images based on their type
            userData.achievements = Array.isArray(userData.achievements) 
                ? userData.achievements 
                : (userData.achievements ? JSON.parse(userData.achievements) : []);
                
            userData.images = Array.isArray(userData.images) 
                ? userData.images 
                : (userData.images ? JSON.parse(userData.images) : []);
        }

        // Remove sensitive data
        delete userData.passwordHash;

        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true
            },
            body: JSON.stringify({
                status: "success",
                data: userData
            })
        };

    } catch (error) {
        console.error('Error fetching user:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: "error",
                message: "Failed to fetch user data"
            })
        };
    } finally {
        if (connection) await connection.end();
    }
};
