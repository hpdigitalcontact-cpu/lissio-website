# field-pilot.co

Static site. No build step — every file is served as-is.

- index.html — landing page
- signup.html — 3-question signup
- app.html — CRM prototype
- support.js, image-slot.js — runtime
- photos/ — imagery
- sitemap.xml, robots.txt

## Deploy
Any static host pointed at this folder. Netlify/Vercel: no build command, publish directory = repo root.

## Before going live
Replace in index.html and signup.html:
- G-XXXXXXXXXX → GA4 measurement ID
- REPLACE_WITH_SEARCH_CONSOLE_TOKEN → Search Console verification token (index.html only)
