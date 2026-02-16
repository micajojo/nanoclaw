const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/blogger'];

// Load client credentials
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));

const { client_id, client_secret, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

async function authenticate() {
  // Check if we have previously stored a token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // Generate auth URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n=== AUTHENTICATION REQUIRED ===');
  console.log('Please visit this URL to authorize the application:');
  console.log(authUrl);
  console.log('\nAfter authorization, you will be redirected to a URL.');
  console.log('Copy the ENTIRE URL and paste it here.\n');

  // For now, just return the auth URL - user needs to complete OAuth flow
  return null;
}

async function getBlogId(blogUrl) {
  const auth = await authenticate();

  if (!auth) {
    console.log('\nTo complete setup:');
    console.log('1. Visit the URL above');
    console.log('2. Authorize the application');
    console.log('3. Copy the redirect URL you receive');
    console.log('4. Send it to me to complete the setup');
    return;
  }

  const blogger = google.blogger({ version: 'v3', auth });

  try {
    const response = await blogger.blogs.getByUrl({
      url: `http://${blogUrl}`,
    });

    const blogId = response.data.id;
    const blogName = response.data.name;

    console.log('\n=== SUCCESS ===');
    console.log(`Blog Name: ${blogName}`);
    console.log(`Blog ID: ${blogId}`);
    console.log(`Blog URL: ${blogUrl}`);

    // Save blog config
    const config = {
      blog_id: blogId,
      blog_url: blogUrl,
      blog_name: blogName
    };

    fs.writeFileSync('blog_config.json', JSON.stringify(config, null, 2));
    console.log('\nSaved configuration to blog_config.json');

  } catch (error) {
    console.error('Error fetching blog:', error.message);
  }
}

// Run
const blogUrl = 'wandhealth.blogspot.com';
getBlogId(blogUrl);
