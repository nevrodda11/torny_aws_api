const mysql = require('mysql2/promise');

const validateEnvVars = () => {
    const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    for (const req of required) {
        if (!process.env[req]) {
            throw new Error(`Missing required environment variable: ${req}`);
        }
    }
};

exports.updateEntryStatusHandler = async (event, context) => {
    console.log('Processing update entry status request');
    let connection = null;

    try {
        validateEnvVars();
        
        const { tournament_id, reference_id, payment_status } = JSON.parse(event.body);
        
        if (!tournament_id || !reference_id || !payment_status) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Tournament ID, reference ID, and payment status are required"
                })
            };
        }

        // Validate payment status
        const validStatuses = ['paid', 'pending', 'unpaid', 'refund'];
        if (!validStatuses.includes(payment_status)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Invalid payment status. Must be one of: paid, pending, unpaid, refunds"
                })
            };
        }

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: {
                rejectUnauthorized: true
            }
        });

        const [result] = await connection.execute(
            'UPDATE entries SET payment_status = ? WHERE tournament_id = ? AND reference_id = ?',
            [payment_status, tournament_id, reference_id]
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
                    message: "Entry not found"
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
                message: "Entry status updated successfully"
            })
        };

    } catch (error) {
        console.error('Update entry status error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to update entry status",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
