/**
 * WhatsApp Authentication Script - Image QR Code Version
 *
 * Saves QR code as PNG image for easier scanning
 */
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';

import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

const AUTH_DIR = './store/auth';
const QR_IMAGE_PATH = './whatsapp-qr.png';

const logger = pino({
  level: 'warn',
});

async function authenticate(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  if (state.creds.registered) {
    console.log('✓ Already authenticated with WhatsApp');
    console.log(
      '  To re-authenticate, delete the store/auth folder and run again.',
    );
    process.exit(0);
  }

  console.log('Starting WhatsApp authentication...\n');

  function connect() {
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: ['NanoClaw', 'Chrome', '1.0.0'],
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Save QR code as PNG image
        await QRCode.toFile(QR_IMAGE_PATH, qr, {
          width: 500,
          margin: 2,
        });

        console.log('✓ QR code saved to: whatsapp-qr.png');
        console.log('  Scan it now — it will auto-refresh when expired.\n');
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as any)?.output?.statusCode;

        if (reason === DisconnectReason.loggedOut) {
          if (fs.existsSync(QR_IMAGE_PATH)) {
            fs.unlinkSync(QR_IMAGE_PATH);
          }
          console.log('\n✗ Logged out. Delete store/auth and try again.');
          process.exit(1);
        } else {
          // QR expired or stream error — reconnect automatically
          console.log('QR expired, generating a new one...\n');
          connect();
        }
      }

      if (connection === 'open') {
        console.log('\n✓ Successfully authenticated with WhatsApp!');
        console.log('  Credentials saved to store/auth/');
        console.log('  You can now start the NanoClaw service.\n');

        if (fs.existsSync(QR_IMAGE_PATH)) {
          fs.unlinkSync(QR_IMAGE_PATH);
        }

        // Give it a moment to save credentials, then exit
        setTimeout(() => process.exit(0), 2000);
      }
    });

    sock.ev.on('creds.update', saveCreds);
  }

  connect();
}

authenticate().catch((err) => {
  console.error('Authentication failed:', err.message);
  process.exit(1);
});
