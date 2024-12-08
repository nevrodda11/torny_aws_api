const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const validateEnvVars = () => {
    console.log('Starting environment variable validation');
    const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
    const missing = required.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
        console.error('Missing environment variables:', missing);
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    console.log('Environment validation successfull');
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

// Function to generate a random password
const generateRandomPassword = (length = 12) => {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
};

function generateReferenceId() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let refId = '';
    
    // Generate 4 random letters
    for (let i = 0; i < 4; i++) {
        refId += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    
    // Generate 4 random numbers
    for (let i = 0; i < 4; i++) {
        refId += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    // Shuffle the characters to mix letters and numbers
    refId = refId.split('').sort(() => 0.5 - Math.random()).join('');
    
    return refId;
}

exports.enterTournamentHandler = async (event, context) => {
    console.log('Processing enter tournament request');
    console.log('Event:', JSON.stringify(event));
    let connection = null;

    try {
        validateEnvVars();
        
        connection = await mysql.createConnection(connectionConfig);
        await connection.beginTransaction();
        console.log('MySQL connection successful');

        const { 
            tournament_id,
            team_id,
            entered_by_user_id,
            user_id,
            temporaryTeam
        } = JSON.parse(event.body);

        console.log('Parsed request body:', { tournament_id, team_id, entered_by_user_id, user_id, temporaryTeam });

        // Validate required fields and data types
        if (!tournament_id || (!team_id && !entered_by_user_id && !user_id && !temporaryTeam)) {
            console.log('Missing required fields:', { tournament_id, team_id, entered_by_user_id, user_id });
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Missing required fields"
                })
            };
        }

        // Determine entry type first
        const isTemporaryTeam = team_id === undefined && !user_id && temporaryTeam;
        const isTeamEntry = team_id !== undefined && team_id !== null;
        
        console.log('Entry type:', 
            isTemporaryTeam ? 'Temporary Team Entry' : 
            (isTeamEntry ? 'Team Entry' : 'Individual Entry')
        );

        // Verify tournament exists
        const [tournament] = await connection.execute(
            'SELECT id FROM tournaments WHERE id = ?',
            [tournament_id]
        );

        if (tournament.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "error",
                    message: "Tournament not found"
                })
            };
        }

        if (isTemporaryTeam) {
            console.log('Processing temporary team entry:', temporaryTeam);
            
            // Validate team_type for lawn bowls
            const validTeamTypes = ['singles', 'pairs', 'triples', 'fours'];
            if (!validTeamTypes.includes(temporaryTeam.team_type?.toLowerCase())) {
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: "error",
                        message: "Invalid team_type. Must be one of: singles, pairs, triples, fours"
                    })
                };
            }

            try {
                await connection.beginTransaction();

                const insertValues = [
                    tournament_id,
                    temporaryTeam.team_name,
                    temporaryTeam.club || null,
                    entered_by_user_id,
                    temporaryTeam.sport_id,
                    temporaryTeam.team_type.toLowerCase(),
                    temporaryTeam.team_gender,
                    temporaryTeam.avatar || null,
                    temporaryTeam.country,
                    temporaryTeam.state,
                    temporaryTeam.region,
                ];

                // Log the exact values being inserted
                console.log('Inserting temporary team with values:', {
                    tournament_id: insertValues[0],
                    team_name: insertValues[1],
                    club: insertValues[2],
                    created_by_user_id: insertValues[3],
                    sport_id: insertValues[4],
                    team_type: insertValues[5],
                    team_gender: insertValues[6],
                    avatar: insertValues[7],
                    country: insertValues[8],
                    state: insertValues[9],
                    region: insertValues[10]
                });

                // 1. Insert temporary team
                const [tempTeamResult] = await connection.execute(
                    `INSERT INTO temporary_teams (
                        tournament_id,
                        team_name,
                        club,
                        created_by_user_id,
                        sport_id,
                        team_type,
                        team_gender,
                        avatar,
                        country,
                        state,
                        region,
                        first,
                        second,
                        third,
                        total_prize_money
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0.00)`,
                    insertValues
                );

                const tempTeamId = tempTeamResult.insertId;
                console.log('Created temporary team with ID:', tempTeamId);

                // 2. Add team members and handle manual entries
                for (const member of temporaryTeam.members) {
                    let userId = member.user_id;

                    // If user_id is null, check for existing user by email
                    if (!userId) {
                        const [existingUser] = await connection.execute(
                            `SELECT id FROM users WHERE email = ?`,
                            [member.email]
                        );

                        if (existingUser.length > 0) {
                            userId = existingUser[0].id;
                            console.log(`Using existing user ID: ${userId} for email: ${member.email}`);
                        } else {
                            // Generate a random password and hash it
                            const randomPassword = generateRandomPassword();
                            const passwordHash = bcrypt.hashSync(randomPassword, 10);

                            // Insert a new user as a placeholder with a random password hash
                            const [result] = await connection.execute(
                                `INSERT INTO users (
                                    name,
                                    email,
                                    phone,
                                    avatar_url,
                                    user_type,
                                    passwordHash
                                ) VALUES (?, ?, ?, ?, 'player', ?)`,
                                [
                                    member.name || null,
                                    member.email || null,
                                    member.phone || null,
                                    member.avatar_url || null,
                                    passwordHash
                                ]
                            );
                            userId = result.insertId;
                            console.log(`Created placeholder user with ID: ${userId}`);
                        }
                    }

                    // Ensure gender is one of the ENUM values
                    const validGenders = ['Male', 'Female', 'Other'];
                    const gender = validGenders.includes(member.gender) ? member.gender : 'Other';

                    // Insert or update player data
                    await connection.execute(
                        `INSERT INTO players_data (user_id, club, sport, gender)
                         VALUES (?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE club = VALUES(club), sport = VALUES(sport), gender = VALUES(gender)`,
                        [
                            userId,
                            member.club || null,
                            member.sport || null,
                            gender
                        ]
                    );
                    console.log(`Updated players_data for user ${userId} with club ${member.club}, sport ${member.sport}, and gender ${gender}`);

                    // Insert team member
                    await connection.execute(
                        `INSERT INTO team_members (
                            temp_team_id,
                            user_id,
                            position,
                            joined_at,
                            club
                        ) VALUES (?, ?, ?, NOW(), ?)`,
                        [
                            tempTeamId,
                            userId,
                            member.position || null,
                            member.club || null
                        ]
                    );
                    console.log(`Added team member ${userId} with position ${member.position}`);
                }
                console.log('Added team members with club:', temporaryTeam.club);

                // 3. Create tournament entry
                const referenceId = generateReferenceId();
                await connection.execute(
                    `INSERT INTO entries (
                        tournament_id,
                        temp_team_id,
                        entry_date,
                        payment_status,
                        reference_id
                    ) VALUES (?, ?, NOW(), 'unpaid', ?)`,
                    [tournament_id, tempTeamId, referenceId]
                );
                console.log('Created tournament entry with reference ID:', referenceId);

                await connection.commit();
                console.log('Transaction committed successfully');

                return {
                    statusCode: 201,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: "success",
                        message: "Temporary team entered successfully",
                        data: {
                            temp_team_id: tempTeamId,
                            reference_id: referenceId
                        }
                    })
                };

            } catch (error) {
                await connection.rollback();
                console.error('Temporary team creation error:', error);
                
                if (error.code === 'ER_DUP_ENTRY') {
                    return {
                        statusCode: 400,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        body: JSON.stringify({
                            status: "error",
                            message: "Team name already exists in this tournament"
                        })
                    };
                }
                
                throw error;
            }
        } else if (isTeamEntry) {
            console.log('Processing team entry with values:', {
                tournament_id,
                team_id,
                user_id: null
            });
            // Validate team_id for team entries
            if (!Number.isInteger(team_id) || team_id <= 0) {
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: "error",
                        message: "Team ID must be a positive integer"
                    })
                };
            }

            // Verify team exists
            const [team] = await connection.execute(
                'SELECT team_id FROM teams WHERE team_id = ?',
                [team_id]
            );

            if (team.length === 0) {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: "error",
                        message: "Team not found"
                    })
                };
            }

            // Check if team is already entered in the tournament
            const [existingTeamEntry] = await connection.execute(
                'SELECT entry_id FROM entries WHERE tournament_id = ? AND team_id = ?',
                [tournament_id, team_id]
            );

            if (existingTeamEntry.length > 0) {
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: "error",
                        message: "Team is already entered in this tournament"
                    })
                };
            }

            const referenceId = generateReferenceId();
            const [result] = await connection.execute(
                `INSERT INTO entries (
                    tournament_id,
                    team_id,
                    user_id,
                    entry_date,
                    reference_id
                ) VALUES (?, ?, NULL, NOW(), ?)`,
                [tournament_id, team_id, referenceId]
            );

            await connection.commit();

            return {
                statusCode: 201,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "success",
                    message: "Team tournament entry submitted successfully",
                    data: {
                        reference_id: referenceId
                    }
                })
            };
        } else {
            console.log('Processing individual entry with values:', {
                tournament_id,
                team_id: null,
                user_id: user_id || entered_by_user_id
            });
            
            const playerUserId = user_id || entered_by_user_id;
            
            // Check if user is already entered in the tournament
            const [existingUserEntry] = await connection.execute(
                'SELECT entry_id FROM entries WHERE tournament_id = ? AND user_id = ?',
                [tournament_id, playerUserId]
            );

            if (existingUserEntry.length > 0) {
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        status: "error",
                        message: "User is already entered in this tournament"
                    })
                };
            }

            const referenceId = generateReferenceId();
            const [result] = await connection.execute(
                `INSERT INTO entries (
                    tournament_id,
                    team_id,
                    user_id,
                    entry_date,
                    reference_id
                ) VALUES (?, NULL, ?, NOW(), ?)`,
                [tournament_id, playerUserId, referenceId]
            );

            await connection.commit();

            return {
                statusCode: 201,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    status: "success",
                    message: "Individual tournament entry submitted successfully",
                    data: {
                        reference_id: referenceId
                    }
                })
            };
        }

    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            sqlMessage: error?.sqlMessage,
            sql: error?.sql,
            values: error?.values
        });
        if (connection) {
            await connection.rollback();
        }
        console.error('Enter tournament error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                status: "error",
                message: "Failed to enter tournament",
                details: error.message
            })
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
