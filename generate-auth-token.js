const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const SECRETS_PATH = './secrets';
const TOKEN_PATH = `${SECRETS_PATH}/token.json`;
const CREDENTIALS_PATH = `${SECRETS_PATH}/credentials.json`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check credentialsDir exists, create it if necessary
if (!fs.existsSync(SECRETS_PATH)){
  console.log(`${SECRETS_PATH} folder does not exists, creating it.`);
  fs.mkdirSync(SECRETS_PATH);
}

if (!fs.existsSync(CREDENTIALS_PATH)){
  console.error(`${CREDENTIALS_PATH} file does not exists. Follow README.md instructions to create it`);
  process.exit(0);
}

// Load client secrets from a local file.
fs.readFile(CREDENTIALS_PATH, (err, content) => {
  if (err) return console.error('Error loading the client secret file:', err);
  const credentials = JSON.parse(content);

  // Create OAuth2 client and authorize
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const OAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const authUrl = OAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize the app by visiting this url:', authUrl);
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    OAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token: ', err);
      // store the token on disk
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
        if (err) console.error(err);
        console.log('Token successfully stored');
      })
    })
  })
});
