# Shift schedule

Volunteers collect sap in shifts. Admins post or assign shifts; students claim them and pick a time; claimed shifts can sync to Google Calendar.

Code: `Maple-Sugar-FE/src/pages/SchedulePage.jsx`, `components/schedule/ShiftAdminPanel.jsx`, `components/schedule/TimePickerDialog.jsx`, `services/scheduleService.js`, `business/alertSchedule.js`; backend `Maple-Sugar-BE/src/routes/schedule.js`, `services/calendarService.js`, `business/availability.js`, `repositories/scheduleRepository.js`.

## Concepts

- **Slot** (`schedule_slots`): a task (`Sap Collection`, `Maintenance`, `Sensor Check`, `Battery Swap`), stand(s), optional buckets, capacity (open spots), notes, completion flag, optional link to an alert. Start and end are both null until a time is chosen ("awaiting time"), or both set with end after start.
- **Assignment** (`schedule_assignments`): a user on a slot, plus the Google Calendar event id for that signup.
- Stands: Alumni House, Chabad House, Red Barn.

## Flows

```mermaid
sequenceDiagram
  participant Admin
  participant Student
  participant API
  participant Google
  Admin->>API: POST /schedule/slots (open shift, or with UserID to assign now)
  Student->>API: GET /schedule/availability (free 2h windows via free/busy)
  Student->>API: POST /schedule/slots/:id/claim-time {Starts_At, Ends_At}
  API->>Google: create calendar event (after responding; failures are warnings)
  Student->>API: POST /schedule/slots/:id/withdraw
```

Admin tools (on `/schedule`, shown with `manage_schedule`; `/schedule-admin` redirects there): a "Manage shifts" form to "Post open shift" (no student) or "Assign shift" (student chosen), with task, student, buckets, start, end, open spots, note. Each shift card gets a complete checkbox and delete button. Deleting removes Calendar events for assignees.

Student page (`/schedule`): summary chips (open shifts, assigned to you, past unclaimed), Active and Completed tabs, a "pick a time" dialog that suggests free windows when Google Calendar is connected, and withdraw.

Alert link: `alertSchedule.js` maps an alert type to a task (battery to Battery Swap; offline, load-cell, untared, freezing and similar to Sensor Check; full bucket, collection needed, spoilage, tipped, spill to Sap Collection; anything else to Maintenance). The Notifications page uses it to open a task from an alert.

## Rules (`business/availability.js`, `America/New_York`)

- Suggested windows: 8-10, 10-12, 12-14, 14-16, 16-18 for the next 7 days, skipping Google busy time and anything starting within 30 minutes.
- A window a student types must be 30 minutes to 6 hours, in the future, within three weeks, and not overlap a busy block.
- Overlap with another shift for the same student rolls the new slot back.
- Students can only sign themselves up; claiming requires the slot to already have times (or use `claim-time`).
- A claimed time needs a Calendar connection; otherwise the API returns 409 `CALENDAR_REQUIRED`.

## Google Calendar

Sign-in requests Calendar in the same OAuth handshake; an incremental consent step exists at `GET /auth/google/calendar`. Scopes: `calendar.events` and `calendar.freebusy`. The refresh token is stored encrypted in `users.google_refresh_token`. `DELETE /auth/calendar` drops it. After connecting, `backfillUserCalendar` copies upcoming claimed shifts. Calendar sync never blocks or undoes a shift.

Register both redirect URIs with Google: `{PUBLIC_API_URL}/auth/google/callback` and `{PUBLIC_API_URL}/auth/google/calendar/callback`.

## API summary

See `Maple-Sugar-BE/docs/api.md#schedule`. Capabilities: `view_schedule` (list, availability), `claim_shift` (signup, withdraw, claim-time), `manage_schedule` (create, patch, delete).

## Open items

- Course rule says students claiming a shift need instructor approval (`business.md`). The code signs a student up immediately on claim. **TODO** confirm whether an approval step is still wanted.
- The commit "schedule polish" (#26) changed the schedule UI and `calendarService`; see [CHANGELOG.md](CHANGELOG.md).
