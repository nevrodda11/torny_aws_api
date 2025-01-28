const mysql = require('mysql2/promise');

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

exports.updatePlayerStatusHandler = async (event, context) => {
    let connection;
    
    try {
        const body = JSON.parse(event.body);
        const { team_id, user_id, status } = body;

        // Validate required fields
        if (!team_id || !user_id || !status) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Missing required fields: team_id, user_id, and status are required"
                })
            };
        }

        // Validate status value
        if (!['approved', 'declined'].includes(status)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Invalid status value. Must be either 'approved' or 'declined'"
                })
            };
        }

        // Connect to database
        connection = await mysql.createConnection(connectionConfig);

        // Update player status
        const [result] = await connection.execute(
            'UPDATE torny_db.team_members SET status = ? WHERE team_id = ? AND user_id = ?',
            [status, team_id, user_id]
        );

        if (result.affectedRows === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Team member not found"
                })
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "success",
                message: `Player status updated to ${status}`,
                data: {
                    team_id,
                    user_id,
                    status
                }
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Internal server error"
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
