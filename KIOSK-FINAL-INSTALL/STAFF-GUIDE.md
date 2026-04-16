# Ninja Games — Staff Quick Reference

Pin this somewhere visible behind the counter.

---

## Secret keyboard phrases (login screen)

Type these on any client PC at the **login screen** — they're keyboard-buffer triggers, no need to find a button.

| Phrase         | What it does                                                     |
| -------------- | ---------------------------------------------------------------- |
| `ghanemadmin`  | Opens the admin login overlay on this PC                         |
| `ghanemexit`   | **Kill switch** — exits the kiosk entirely (returns to Windows)  |

The kill switch is for emergencies (locked out, frozen kiosk). Don't use during a player session — they'll see the desktop.

---

## Common situations

### "Customer says their PIN doesn't work"
1. Ask if they used to have an EasyCafe / Tinasoft account at the old shop. If yes, they're a **legacy user** — they should type their **old password** (not a 6-digit PIN). The kiosk auto-detects this from the username and switches the input.
2. If still stuck, open `/ghanimadmin` → Players → search by phone or name → "Reset PIN". They set a new one on next login.

### "Customer wants a refund"
1. `/ghanimadmin` → Players → find the player.
2. "Adjust Tokens" → enter a negative number to remove tokens, or positive to credit them back.
3. Document the reason in the activity log (auto-recorded).

### "Customer wants to add credit / top up"
**Two paths:**
- **From the kiosk PC**: customer clicks the TOP UP button → picks a package → admin gets a popup notification on `/ghanimadmin` → **Accept** marks it paid.
- **Manual from admin**: `/ghanimadmin` → Players → find player → "Add Tokens" → enter the JOD amount equivalent.

### "PC is stuck / frozen"
1. Try `/ghanimadmin` → PCs → click the PC card → **Restart**.
2. If unresponsive: physically restart it. Watchdog (`WATCHDOG.bat`) will relaunch the kiosk on next login.
3. If the kiosk doesn't auto-launch on boot, run `INSTALL.bat` again as admin.

### "Customer's game won't launch"
1. `/ghanimadmin` → PCs → select PC → **Info** tab → check "Installed Games" — is the game listed?
2. If not, go to that PC, install the game where it normally lives, then back in admin click **Re-scan Games** on the PC.
3. The game catalog will refresh, and the launch button will work next time.

### "Two customers are using the same account"
- Sessions are tracked per PC. Open `/ghanimadmin` → Sessions → filter by player. Tell them to share is allowed for friends, but VIP perks only count once.

### "Player wants to send tokens to a friend"
- Player can do this themselves: kiosk sidebar → SEND COINS → enter friend's username + amount.
- Min/max limits configured in admin Settings.

### "Player got a chest / item but it's missing"
- `/ghanimadmin` → Players → select player → **Inventory** tab → see what they own. If genuinely missing, "Grant Item" to restore.

---

## Admin dashboard map (`/ghanimadmin`)

| Tab               | What's there                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| **Dashboard**     | Today's revenue, active players, online PCs, top-up queue badge.             |
| **PCs**           | Live status of every kiosk PC. Lock/unlock/restart/screen-share/installed games. |
| **Players**       | Search, edit, ban, refund, reset PIN, send messages, view session history.   |
| **Top Ups**       | Pending top-up requests from kiosks. Accept / decline.                       |
| **Menu**          | Add/remove food and drink items, prices, prep times, photos.                 |
| **Orders**        | Live food + shisha orders. Accept → Preparing → Ready → Delivered.           |
| **Hubbly**        | Shisha-only order view (subset of Orders).                                   |
| **Tournaments**   | Create, manage brackets, declare winners, payouts.                           |
| **Revenue**       | Daily / weekly / monthly P&L. Expenses tracked separately.                   |
| **Notifications** | Send push to all or specific player (OneSignal).                             |
| **Roles & Access**| Staff accounts, permission per tab.                                          |
| **Activity Log**  | Audit trail — who did what, when.                                            |

---

## Closing the shop

1. `/ghanimadmin` → PCs → "Lock All" (top-right) — locks every client PC. Players can no longer start sessions.
2. Optional: "Shutdown All" if you want every PC powered off.
3. Don't shut down the **server PC** unless the shop is closed for the day — without it, the cloud fallback (`ninjagamesjo.com`) still works for client PCs but data syncs delayed.

---

## Important file locations (server PC)

- Project: `C:\Users\vip-2\Desktop\Ninja Games Kiosk Final 2026\`
- Daily backups: `server\backups\YYYY-MM-DD\`
- Watchdog logs: `%TEMP%\ninja-watchdog.log`
- Kiosk client logs (each PC): `%APPDATA%\ninja-games-kiosk\app.log`
- Per-PC config: `%APPDATA%\ninja-games-kiosk\pc-config.json`
- Discovered installed games (per PC): `%APPDATA%\ninja-games-kiosk\discovered-games.json`

---

## Emergency contacts

> Fill in on day-of-launch:
>
> - **Owner / on-call**: ___________________
> - **IT / network**: ___________________
> - **Internet provider**: ___________________
> - **Vercel / cloud admin**: ___________________
