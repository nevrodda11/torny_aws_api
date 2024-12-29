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

exports.addClubAdminHandler = async (event, context) => {
    let connection = null;
    try {
        validateEnvVars();
        const { user_id, club_id, role = 'admin' } = JSON.parse(event.body);
        
        connection = await mysql.createConnection(connectionConfig);
        
        // Check if the club exists
        const [clubExists] = await connection.execute(
            'SELECT club_id FROM clubs_data WHERE club_id = ?',
            [club_id]
        );
        
        if (clubExists.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    status: "error",
                    message: "Club not found"
                })
            };
        }

        // Check if user already has a role in this club
        const [existingRole] = await connection.execute(
            'SELECT role FROM club_admins WHERE user_id = ? AND club_id = ?',
            [user_id, club_id]
        );

        if (existingRole.length > 0) {
            // Update existing role
            await connection.execute(
                'UPDATE club_admins SET role = ? WHERE user_id = ? AND club_id = ?',
                [role, user_id, club_id]
            );
        } else {
            // Add new admin
            await connection.execute(
                'INSERT INTO club_admins (user_id, club_id, role) VALUES (?, ?, ?)',
                [user_id, club_id, role]
            );
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: "success",
                message: "Club admin added successfully"
            })
        };
    } catch (error) {
        console.error('Error adding club admin:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                status: "error",
                message: "Failed to add club admin"
            })
        };
    } finally {
        if (connection) await connection.end();
    }
};
