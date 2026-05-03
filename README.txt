BBHub v3

This version includes:
- hamburger menu / slide-out nav
- Home / Stage Layout / Band Library / Planner / Debug views
- login/session UI
- public next gig / next rehearsal / program
- compact event cards
- local RSVP buttons in demo mode
- stage layout SVG view
- corrected parsing for Google Sheets date/time values

Important:
Replace js/config.js with your real config.js after unzip.

Then test:
index.html
index.html?debug=true


BBHub v43 availability update:
- Availability cards now show Google Directions from Events.map_url when supplied.
- If map_url is blank, the card auto-builds a Google directions link from Events.location/venue/address.
- Optional Events.parking_url and Events.entry_url show Parking and Entry action links when supplied.


BBHub v45 availability header tidy
- Removed duplicated A-/A+/Reset/100% text-size controls from the main header.
- Existing availability RSVP card behaviour retained.
