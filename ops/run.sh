#!/bin/zsh
# Launched by launchd on the server (com.cauldron.server). launchd starts with a minimal PATH,
# so add Homebrew's bin for node, npm and the optional `claude` CLI. Next.js reads .env.local itself.
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd "${0:A:h}/.."
exec npm start
