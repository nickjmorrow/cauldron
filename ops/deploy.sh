#!/bin/zsh
# Run on your own machine: test, copy the repo to the server, install and build there, (re)start the service.
# The server is the ssh host in CAULDRON_DEPLOY_HOST, set in the gitignored .env.local or the environment.
# First run also installs the launchd agents (the server and the nightly ops/backup.sh) and a tailnet-only `tailscale serve` on CAULDRON_SERVE_PORT.
# .env.local is copied along with the code, so the server gets the same settings.
# The database (data/) is never copied or touched: the server keeps its own. Seed it once by hand (see README).
set -euo pipefail
cd "${0:A:h}/.."
if [[ -f .env.local ]]; then set -a; source ./.env.local; set +a; fi
host=${CAULDRON_DEPLOY_HOST:?set CAULDRON_DEPLOY_HOST to the server ssh host, e.g. in .env.local}
serve_port=${CAULDRON_SERVE_PORT:-8456}
npm test
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git --exclude data --exclude tsconfig.tsbuildinfo \
  --exclude apple --exclude .claude --exclude .dashboard --exclude .impeccable --exclude .DS_Store \
  --exclude CLAUDE.local.md --exclude docs/superpowers --exclude docs/morning-notes.md --exclude 'scripts/peek*.mjs' \
  ./ "${host}:Projects/cauldron/"
ssh "$host" "zsh -lc '
  set -e
  export PATH=/opt/homebrew/bin:\$PATH
  cd ~/Projects/cauldron
  mkdir -p data
  npm ci >/dev/null
  npm run build >/dev/null
  for label in com.cauldron.server com.cauldron.backup; do
    plist=~/Library/LaunchAgents/\$label.plist
    rendered=\$(mktemp)
    sed \"s|__HOME__|\$HOME|g\" ops/\$label.plist > \$rendered
    if ! cmp -s \$rendered \$plist; then
      launchctl bootout gui/\$(id -u)/\$label 2>/dev/null || true
      cp \$rendered \$plist
      launchctl bootstrap gui/\$(id -u) \$plist
    elif [[ \$label == com.cauldron.server ]]; then
      launchctl kickstart -k gui/\$(id -u)/\$label
    fi
    rm -f \$rendered
  done
  ts=/Applications/Tailscale.app/Contents/MacOS/Tailscale
  \$ts serve status | grep -q \":${serve_port} \" ||
    \$ts serve --bg --https=${serve_port} http://127.0.0.1:3100 >/dev/null
'"
sleep 5
ssh "$host" 'curl -sf -o /dev/null http://127.0.0.1:3100/ && echo "cauldron is up on the server" || (tail -20 ~/Library/Logs/cauldron.log; exit 1)'
