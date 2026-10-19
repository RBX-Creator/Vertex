#!/usr/bin/env bash
# SessionStart-Hook: gibt Jarvis Datum, Uhrzeit und den Zustand des Gehirns mit.
# Alles, was hier ausgegeben wird, landet als Kontext in der Session.
cd "$(dirname "$0")/.." || exit 0

export TZ="${JARVIS_TZ:-Europe/Berlin}"
echo "Aktuelles Datum/Uhrzeit: $(date '+%A, %Y-%m-%d %H:%M') ($TZ)"

today="brain/gedaechtnis/journal/$(date +%F).md"
if [ -f "$today" ]; then
  echo "Journal heute existiert bereits – nicht das erste Gespräch des Tages."
else
  echo "Erstes Gespräch des Tages – ein kurzes Briefing anbieten."
fi

open_count=$(grep -rho '\[OFFEN\]' brain 2>/dev/null | wc -l | tr -d ' ')
if [ "$open_count" -gt 0 ]; then
  echo "Gehirn unvollständig: $open_count offene Platzhalter ([OFFEN])."
fi

overdue=""
now=$(date +%F)
while IFS= read -r line; do
  due=$(printf '%s' "$line" | grep -oE 'fällig: [0-9]{4}-[0-9]{2}-[0-9]{2}' | grep -oE '[0-9-]{10}')
  [ -n "$due" ] && [[ "$due" < "$now" ]] && overdue+="$line"$'\n'
done < <(grep -E '^- \[ \]' brain/aufgaben.md 2>/dev/null)
if [ -n "$overdue" ]; then
  echo "Überfällige Aufgaben:"
  printf '%s' "$overdue"
fi
