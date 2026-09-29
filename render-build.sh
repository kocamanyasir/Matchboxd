#!/usr/bin/env bash
# Alternative build script if choosing Node runtime on Render instead of Docker
set -o errexit

npm install
npx puppeteer browsers install chrome
npm run build
