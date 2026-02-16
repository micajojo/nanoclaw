# NanoClaw Setup Status

**Last Updated:** 2026-02-08 00:12 KST
**Status:** 95% Complete - Only WhatsApp authentication remaining

## ✅ Completed Steps

1. **Dependencies Installed**
   - All npm packages installed
   - Docker verified (running)

2. **Claude Authentication Configured**
   - OAuth token saved to `.env`
   - Token: `sk-ant-oat01-pciNe...` (configured)

3. **Container Built**
   - Image: `nanoclaw-agent:latest`
   - Includes: Node.js, Chromium, Claude Code CLI, agent-browser
   - Verified working with test run

4. **Assistant Configuration**
   - Name: **Andy**
   - Trigger: `@Andy` in groups (no prefix in main channel)

5. **Main Channel Registered**
   - Type: Personal chat (Message Yourself)
   - Phone: 821095680302
   - JID: `821095680302@s.whatsapp.net`
   - Config: `data/registered_groups.json`
   - Requires trigger: `false` (no @Andy prefix needed)

6. **External Directory Access**
   - Mount allowlist: Created (no external directories allowed)
   - Location: `~/.config/nanoclaw/mount-allowlist.json`
   - Security: Most restrictive (agents only access their group folders)

7. **Systemd Service Configured**
   - Service file: `~/.config/systemd/user/nanoclaw.service`
   - Enabled: Yes (will start on login)
   - Currently: Stopped (waiting for WhatsApp auth)

## ⏳ Remaining Step: WhatsApp Authentication

**Issue:** Rate limited by WhatsApp (error code 515) after multiple auth attempts
**Cause:** Too many QR code requests in short time
**Solution:** Wait 30+ minutes, then authenticate

### To Complete Tomorrow:

```bash
# 1. Stop service if running
systemctl --user stop nanoclaw.service

# 2. Clear old auth attempts
rm -rf store/auth/*

# 3. Run authentication (creates whatsapp-qr.png)
npx tsx src/whatsapp-auth-image.ts

# 4. Open the QR code image
xdg-open whatsapp-qr.png
# OR navigate to: /home/jojo/nanoclaw/whatsapp-qr.png

# 5. Scan with WhatsApp on your phone:
#    - Open WhatsApp
#    - Settings → Linked Devices → Link a Device
#    - Scan the QR code

# 6. Wait for success message: "✓ Successfully authenticated with WhatsApp!"

# 7. Start the service
systemctl --user start nanoclaw.service

# 8. Verify it's running
systemctl --user status nanoclaw.service
```

## Testing After Authentication

Once authenticated, test by messaging yourself on WhatsApp:

```
# In your personal chat (Message Yourself):
hello

# Or any message - no @Andy prefix needed

# In group chats:
@Andy hello
```

## Useful Commands

```bash
# Service management
systemctl --user start nanoclaw.service    # Start
systemctl --user stop nanoclaw.service     # Stop
systemctl --user restart nanoclaw.service  # Restart
systemctl --user status nanoclaw.service   # Check status

# View logs
journalctl --user -u nanoclaw.service -f   # Follow logs in real-time
journalctl --user -u nanoclaw.service -n 50 --no-pager  # Last 50 lines

# Check if WhatsApp is connected
grep "Connected to WhatsApp" <(journalctl --user -u nanoclaw.service -n 100 --no-pager)
```

## Configuration Files Created

- `/home/jojo/nanoclaw/.env` - Claude OAuth token
- `/home/jojo/nanoclaw/data/registered_groups.json` - Main channel config
- `~/.config/nanoclaw/mount-allowlist.json` - Directory access rules
- `~/.config/systemd/user/nanoclaw.service` - Service configuration
- `/home/jojo/nanoclaw/src/whatsapp-auth-image.ts` - Image-based QR auth script

## Project Structure

```
/home/jojo/nanoclaw/
├── .env                          # Claude OAuth token
├── data/
│   └── registered_groups.json    # Your main channel config
├── store/
│   └── auth/                     # WhatsApp credentials (empty - needs auth)
├── groups/
│   ├── main/                     # Your personal channel workspace
│   │   └── logs/                 # Container logs
│   └── global/                   # Shared memory across all groups
├── container/
│   └── build.sh                  # Container build script
└── dist/                         # Compiled TypeScript
```

## Known Issues

1. **Claude Code API Error (400)** - Extended thinking blocks bug
   - This is a Claude Code CLI bug, NOT a NanoClaw issue
   - Does not affect NanoClaw functionality
   - Shows in debug logs but can be ignored

2. **WhatsApp Rate Limiting (515)**
   - Temporary block after multiple auth attempts
   - Clears after 30+ minutes
   - Don't retry authentication immediately

## Next Session Checklist

Tomorrow when you continue:

- [ ] Ensure it's been at least 30 minutes since last auth attempt
- [ ] Run WhatsApp authentication script
- [ ] Scan QR code with phone
- [ ] Wait for success message
- [ ] Start systemd service
- [ ] Send test message to yourself on WhatsApp
- [ ] Verify response from Andy

## Need Help?

If you encounter issues tomorrow:

1. Check service logs: `journalctl --user -u nanoclaw.service -n 100 --no-pager`
2. Verify WhatsApp auth: `ls -la store/auth/` (should have creds.json and app-state-sync files)
3. Check registration status: `grep '"registered"' store/auth/creds.json` (should be `true`)
4. Run `/debug` skill if something isn't working

## Resources

- Setup skill: Run `/setup` to access setup instructions again
- Debug skill: Run `/debug` to diagnose issues
- Customize skill: Run `/customize` to add features later
- Project docs: See `README.md` and `docs/REQUIREMENTS.md`
