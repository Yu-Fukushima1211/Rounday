# Rounday Widgets

Rounday is a PWA, so iOS widgets cannot read its `localStorage` directly.
This repo includes two workaround widgets.

## Scriptable

1. Install Scriptable on iPhone.
2. Paste `Rounday-widget.js` into a new Scriptable script named `Rounday-widget`.
3. In Rounday, open Settings and tap `Widget JSON`.
4. Save `rounday-widget.json` to `iCloud Drive/Scriptable/`.
5. Add a Scriptable widget to the Home Screen and choose `Rounday-widget`.

Refresh data by tapping `Widget JSON` again and replacing the same JSON file.

## Widget Web

1. Install Widget Web on iPhone.
2. In Rounday, open Settings and tap `Widget Web`.
3. Share or copy the generated URL.
4. Open that URL in Widget Web and add it as a widget.

The URL opens `widget-web.html` with encoded Rounday data in the hash.
The widget page stores the data in Widget Web's local storage, then renders today's events, reminders, and TODOs.

Refresh data by tapping `Widget Web` again after changing Rounday data, then opening the new generated URL in Widget Web.

Note: opening the full Rounday PWA from an iOS widget is limited by iOS. These widgets can link to the Rounday URL, but iOS may open it in Safari instead of the installed Home Screen PWA.
