#!/data/data/com.termux/files/usr/bin/sh
# Pushes this phone's battery status to sysmon once a minute.
# Needs: pkg install termux-api jq curl   (plus the Termux:API app from the same source as Termux)
# Config goes in ~/.battery.env:
#   export SYSMON_URL="https://server.tailc2b06e.ts.net"
#   export BATTERY_TOKEN="same value as in the server's .env"

[ -f "$HOME/.battery.env" ] && . "$HOME/.battery.env"
: "${SYSMON_URL:?set SYSMON_URL in ~/.battery.env}"
: "${BATTERY_TOKEN:?set BATTERY_TOKEN in ~/.battery.env}"

while true; do
  status=$(termux-battery-status 2>/dev/null)
  if [ -n "$status" ]; then
    payload=$(printf '%s' "$status" | jq -c '{percent: .percentage, charging: (.status == "CHARGING"), temperature: .temperature}')
    curl -fsS -m 20 -X POST "$SYSMON_URL/api/battery" \
      -H "Authorization: Bearer $BATTERY_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$payload" >/dev/null || echo "$(date +%T) push failed"
  else
    echo "$(date +%T) termux-battery-status returned nothing"
  fi
  sleep 60
done
