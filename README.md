# sysmon

Single-user server status dashboard: CPU per core, memory, disks, battery (if available), uptime.
Express 5, Handlebars, file-based password hash, rate limiting. No database.

## First-time setup (on the VM)

    git clone <repo> && cd sysmon
    cp .env.example .env            # then put a random value in SESSION_SECRET
    mkdir -p data
    docker compose build
    docker run --rm -it -v "$PWD/data:/data" sysmon:prod node scripts/set-password.js /data/auth.json
    docker compose up -d
    tailscale funnel --bg 3000

If the container can't read `data/auth.json`, check that the file's owner uid matches the `node` user (uid 1000).

## Dev (hot reload)

    docker compose -f compose.yaml -f compose.dev.yaml up --build

Dev needs `data/auth.json` too. Open http://localhost:3000 (cookies are not secure-only in dev).

## Notes
- Rate limits: 120 requests/min per IP overall, 5 failed logins per 15 minutes per IP.
- Sessions live in memory, so restarting the container signs you out.
- Stats are what the VM sees, not the phone. The phone's battery is pushed in by phone/battery-push.sh (Termux) and shown once BATTERY_TOKEN is set.
- To change the password: rerun set-password.js, then `docker compose restart`.
