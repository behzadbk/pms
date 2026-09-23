#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
git add .
git commit -m "Initial project upload"
git branch -M main
git remote set-url origin https://github.com/behzadbk/pms.git
git push -u origin main
