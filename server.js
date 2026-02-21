require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory user storage (in production, use a database)
const users = [];
const transactions = [];

// Email transporter setup
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Helper function to send email
const sendEmail = async (to, subject, html) => {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'Star Investments <noreply@starinvest.com>',
            to: to,
            subject: subject,
            html: html
        });
        console.log('Email sent:', info.messageId);
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
};

// Helper function to find user by phone
const findUserByPhone = (phone) => {
    return users.find(user => user.phone === phone);
};

// Helper function to find user by email
const findUserByEmail = (email) => {
    return users.find(user => user.email === email);
};

// Helper function to validate phone number format
const validatePhoneNumber = (phone) => {
    // Uganda phone number format: +256 followed by 9 digits
    const phoneRegex = /^\+256[0-9]{9}$/;
    return phoneRegex.test(phone);
};

// Helper function to validate email format
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Helper function to validate password
const validatePassword = (password) => {
    // Minimum 6 characters
    return password && password.length >= 6;
};

// ==================== AUTHENTICATION ENDPOINTS ====================

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
    try {
        const { phone, email, password, confirmPassword, referralCode } = req.body;

        console.log('Registration attempt:', { phone, email });

        // Validation
        if (!phone || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Phone number, email, and password are required'
            });
        }

        // Validate phone number format
        if (!validatePhoneNumber(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number format. Use format: +256xxxxxxxxx'
            });
        }

        // Validate email format
        if (!validateEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Validate password length
        if (!validatePassword(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Check if passwords match
        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match'
            });
        }

        // Check if user already exists by phone
        const existingUserByPhone = findUserByPhone(phone);
        if (existingUserByPhone) {
            return res.status(409).json({
                success: false,
                message: 'An account with this phone number already exists'
            });
        }

        // Check if user already exists by email
        const existingUserByEmail = findUserByEmail(email);
        if (existingUserByEmail) {
            return res.status(409).json({
                success: false,
                message: 'An account with this email already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate verification token
        const verificationToken = uuidv4();

        // Create new user
        const newUser = {
            id: uuidv4(),
            phone,
            email,
            password: hashedPassword,
            referralCode: referralCode || null,
            verificationToken: verificationToken,
            isVerified: false,
            createdAt: new Date().toISOString(),
            investments: []
        };

        // Save user
        users.push(newUser);

        // Send confirmation email
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .button { display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>⭐ Star Investments</h1>
                        <p>Welcome to Smart Investments, Daily Returns</p>
                    </div>
                    <div class="content">
                        <h2>Confirm Your Email Address</h2>
                        <p>Thank you for registering with Star Investments!</p>
                        <p>Please click the button below to verify your email address and activate your account:</p>
                        <center>
                            <a href="${verificationUrl}" class="button">Verify Email Address</a>
                        </center>
                        <p>Or copy and paste this link into your browser:</p>
                        <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
                        <p><strong>Note:</strong> This verification link will expire in 24 hours.</p>
                        <p>If you did not create an account with Star Investments, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 Star Investments. All rights reserved.</p>
                        <p>This is an automated email, please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const emailSent = await sendEmail(email, 'Confirm Your Email - Star Investments', emailHtml);

        if (!emailSent) {
            console.log('Warning: Email failed to send, but user was created');
        }

        res.status(201).json({
            success: true,
            message: 'Registration successful! Please check your email to verify your account.',
            data: {
                user: {
                    id: newUser.id,
                    phone: newUser.phone,
                    email: newUser.email,
                    isVerified: newUser.isVerified,
                    createdAt: newUser.createdAt
                },
                emailSent: emailSent
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
});

// Verify email endpoint
app.get('/api/auth/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Verification token is required'
            });
        }

        // Find user by verification token
        const userIndex = users.findIndex(user => user.verificationToken === token);
        
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Invalid or expired verification token'
            });
        }

        // Mark user as verified
        users[userIndex].isVerified = true;
        users[userIndex].verificationToken = null;
        users[userIndex].verifiedAt = new Date().toISOString();

        res.status(200).json({
            success: true,
            message: 'Email verified successfully! You can now login.',
            data: {
                user: {
                    id: users[userIndex].id,
                    phone: users[userIndex].phone,
                    email: users[userIndex].email,
                    isVerified: users[userIndex].isVerified
                }
            }
        });

    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Email verification failed'
        });
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        // Validation
        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and password are required'
            });
        }

        // Validate phone number format
        if (!validatePhoneNumber(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number format'
            });
        }

        // Validate password length
        if (!validatePassword(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Find user
        const user = findUserByPhone(phone);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number or password'
            });
        }

        // Check if email is verified
        if (!user.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'Please verify your email address before logging in'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number or password'
            });
        }

        // Return user data (in production, generate JWT token)
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user.id,
                    phone: user.phone,
                    email: user.email,
                    isVerified: user.isVerified,
                    createdAt: user.createdAt
                }
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
});

// Resend verification email
app.post('/api/auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Find user by email
        const userIndex = users.findIndex(user => user.email === email);
        
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if already verified
        if (users[userIndex].isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email is already verified'
            });
        }

        // Generate new verification token
        const verificationToken = uuidv4();
        users[userIndex].verificationToken = verificationToken;

        // Send verification email
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .button { display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>⭐ Star Investments</h1>
                        <p>Welcome to Smart Investments, Daily Returns</p>
                    </div>
                    <div class="content">
                        <h2>Confirm Your Email Address</h2>
                        <p>Please click the button below to verify your email address:</p>
                        <center>
                            <a href="${verificationUrl}" class="button">Verify Email Address</a>
                        </center>
                        <p>Or copy and paste this link into your browser:</p>
                        <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 Star Investments. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const emailSent = await sendEmail(email, 'Confirm Your Email - Star Investments', emailHtml);

        if (!emailSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to send verification email'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Verification email sent successfully',
            data: { emailSent: true }
        });

    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend verification email'
        });
    }
});

// ==================== PAYMENT ENDPOINTS ====================

// Initiate payment
app.post('/api/payment/initiate', async (req, res) => {
    try {
        const { phone, amount, planName, description } = req.body;

        // Validation
        if (!phone || !amount || !planName) {
            return res.status(400).json({
                success: false,
                message: 'Phone number, amount, and plan name are required'
            });
        }

        // Validate phone number format
        if (!validatePhoneNumber(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number format'
            });
        }

        // Validate amount
        if (amount < 500 || amount > 10000000) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be between 500 and 10,000,000 UGX'
            });
        }

        // Generate unique reference
        const reference = uuidv4();

        // Prepare payment data for MarzPay
        const paymentData = {
            amount: amount,
            phone_number: phone,
            country: 'UG',
            reference: reference,
            description: description || `Investment: ${planName} Plan`,
            callback_url: `${process.env.FRONTEND_URL}/payment-callback`
        };

        // Make API call to MarzPay
        const response = await axios.post(
            `${process.env.MARZPAY_API_BASE_URL}/collect-money`,
            paymentData,
            {
                headers: {
                    'Authorization': `Basic ${process.env.MARZPAY_AUTH_HEADER}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        // Store transaction
        const transaction = {
            id: response.data.data.transaction.uuid,
            reference: reference,
            phone: phone,
            amount: amount,
            planName: planName,
            status: 'processing',
            createdAt: new Date().toISOString()
        };
        transactions.push(transaction);

        res.status(200).json({
            success: true,
            message: 'Payment initiated successfully',
            data: {
                transaction: response.data.data.transaction,
                collection: response.data.data.collection
            }
        });

    } catch (error) {
        console.error('Payment initiation error:', error);
        res.status(500).json({
            success: false,
            message: error.response?.data?.message || 'Payment initiation failed'
        });
    }
});

// Check payment status
app.get('/api/payment/status/:transactionId', async (req, res) => {
    try {
        const { transactionId } = req.params;

        // Make API call to MarzPay
        const response = await axios.get(
            `${process.env.MARZPAY_API_BASE_URL}/collect-money/${transactionId}`,
            {
                headers: {
                    'Authorization': `Basic ${process.env.MARZPAY_AUTH_HEADER}`
                }
            }
        );

        // Update transaction status in our records
        const transactionIndex = transactions.findIndex(t => t.id === transactionId);
        if (transactionIndex !== -1) {
            transactions[transactionIndex].status = response.data.data.transaction.status;
            transactions[transactionIndex].updatedAt = new Date().toISOString();
        }

        res.status(200).json({
            success: true,
            data: response.data.data
        });

    } catch (error) {
        console.error('Payment status check error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check payment status'
        });
    }
});

// ==================== USER ENDPOINTS ====================

// Get user investments
app.get('/api/user/investments/:phone', (req, res) => {
    try {
        const { phone } = req.params;
        const user = findUserByPhone(phone);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                investments: user.investments
            }
        });

    } catch (error) {
        console.error('Get investments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get investments'
        });
    }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
});