#!/bin/zsh
# Nightly on the server (com.cauldron.backup): a dated copy of the database plus the item photos in
# $CAULDRON_BACKUP_DIR (set in .env.local; default ~/CauldronBackups). Keeps the newest $KEEP copies.
# The database is copied with SQLite's backup command, so the running server can't leave a half-written copy.
set -euo pipefail
cd "${0:A:h}/.."
if [[ -f .env.local ]]; then set -a; source ./.env.local; set +a; fi
KEEP=30
db=${CAULDRON_DB:-data/cauldron.db}
photos=${db%.db}-photos
dest=${CAULDRON_BACKUP_DIR:-$HOME/CauldronBackups}
mkdir -p "$dest/photos"
copy="$dest/cauldron-$(date +%F).db"
/usr/bin/sqlite3 "$db" ".timeout 10000" ".backup '$copy.tmp'"
# One self-contained file, with no -wal/-shm beside it.
/usr/bin/sqlite3 "$copy.tmp" "pragma journal_mode = delete" >/dev/null
rm -f "$copy.tmp-shm" "$copy.tmp-wal"
mv "$copy.tmp" "$copy"
# Photos are kept even after their item is removed, so any dated copy can find its pictures.
[[ -d "$photos" ]] && rsync -a "$photos/" "$dest/photos/"
ls -1t "$dest"/cauldron-*.db | tail -n +$((KEEP + 1)) | while read -r old; do rm -- "$old"; done
echo "$(date '+%F %T') backed up to $copy ($(/usr/bin/sqlite3 "$copy" 'select count(*) from shopping_items') shopping items)"
