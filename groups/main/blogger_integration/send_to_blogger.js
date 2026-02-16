require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

/**
 * Send email to Blogger's email-to-post address
 * @param {string} title - Blog post title
 * @param {string} content - Blog post content (HTML or plain text)
 */
async function sendToBlogger(title, content) {
  // Load config
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'blogger_config.json'))
  );

  // Check for SMTP credentials in environment or config
  const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
    console.error('ERROR: SMTP credentials not configured');
    console.error('Please set SMTP_USER and SMTP_PASS environment variables');
    console.error('Example: export SMTP_USER=your-email@gmail.com');
    console.error('Example: export SMTP_PASS=your-app-password');
    return false;
  }

  try {
    // Create transporter
    const transporter = nodemailer.createTransport(smtpConfig);

    // Send email
    const info = await transporter.sendMail({
      from: smtpConfig.auth.user,
      to: config.email_to_post,
      subject: title,
      html: content,
      text: content.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Blog post should appear at:', config.blog_url);
    return true;

  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    return false;
  }
}

// Test function
async function test() {
  const testTitle = '테스트 포스트 (Test Post)';
  const testContent = `
<h2>테스트 포스트</h2>
<p>이것은 자동 게시 테스트입니다.</p>
<p>This is an automated posting test.</p>
<ul>
  <li>항목 1</li>
  <li>항목 2</li>
</ul>
  `.trim();

  await sendToBlogger(testTitle, testContent);
}

// If run directly, run test
if (require.main === module) {
  test();
}

module.exports = { sendToBlogger };
