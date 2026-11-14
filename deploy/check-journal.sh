#!/bin/bash
# check-journal.sh — READ-ONLY: gps-tcp verbindingshistorie
journalctl -u gps-tcp --no-pager | grep -viE 'listening|dashboard' | tail -30
echo "---"
journalctl -u gps-tcp --no-pager | grep -c 'verbinding\|connection\|IMEI' || echo 0
