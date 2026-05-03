BBHub Availability MVP - v55

Test URL examples:
  index.html?mode=availability&member=graeme.omeara
  index.html?mode=availability&key=<member_login_key>
  index.html?mode=availability&key=<member_login_key>&debug=true

What this version includes:
- Mobile-first availability screen.
- Lists all gigs this year, not only assigned gigs.
- Three quick responses per gig: Available / Maybe / No.
- Immediate card update after tapping a response.
- Reverts the UI if the server save fails.
- Header says Hi <FirstName> and shows the main chair context, e.g. Hi Graeme · Baritone 2.
- Internal member id only appears with debug=true.
- APB/NEXT GIG panel shows the next gig, date/time, relative timing, and compact RSVP pulse.
- APB panel links directly to the correct gig card.
- Card title numbers show event order.
- Chair row includes compact gig summary: ✓ yes, ? maybe, ✕ no, ! no reply.
- Event location supports automatic Google Directions links from location/venue/address.
- Optional map_url, parking_url, and entry_url fields are supported.

Recommended RSVP tab columns:
  event_id | member_id | response | updated_at | updated_by | note

Recommended email link pattern:
  https://bbhub.app/?mode=availability&key=<member_login_key>

Notes:
- Assignments determine chair context.
- RSVP records determine availability status.
- Availability is deliberately separate from assignment so users can respond for every gig.

v60 note:
- Availability location row is now defensive and always renders.
- It accepts location/venue/address/place/destination plus common capitalised or spaced Sheet headers.
- If a map URL exists without a text destination, the card shows a clickable "Location" fallback.
