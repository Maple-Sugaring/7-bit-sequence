# Service layer

`src/services/` is for use cases that are more than one SQL statement, or that call Google or OpenWeather. Routes stay thin: parse, authorize, call, respond.

## `authService`

`resolveGoogleUser(profile)`

1. Rejects emails outside `ALLOWED_EMAIL_DOMAINS`.
2. Finds the user by `google_sub`.
3. If that misses, finds an invite by email and links `google_sub`, filling blank names from Google.
4. Refuses inactive or expired accounts with `ACCOUNT_EXPIRED`.
5. Unknown emails get `NOT_PROVISIONED`. There is no self-signup.

`loadSessionUser` re-reads the user on every authenticated request so a deactivated account stops working before the JWT expires.

## `metricsService`

`listMetrics` is a cached read.

`createMetric` validates with `business/validation.js`, confirms the node exists, inserts the row with the session user id, then `deriveAlerts`. Alert failures are logged and do not roll back the reading.

`updateMetric` re-validates the merged row. `NodeID` is not writable.

## `weatherService`

`getDaily` returns historic `sap_daily` rows and the station note.

`getCompare` returns one series per tracked tree for a calendar year. Sugar Woods draws from this.

`getLive` calls OpenWeather current and 5-day forecast for each campus coordinate in `business/sites.js`, then keeps one campus reading because the buildings are close. Results are cached in memory for 10 minutes.

On each refresh it may insert alerts:

- Sap Run, when freeze-thaw flow is new or clearly stronger than the last snapshot (`business/sapFlow.js`).
- Extreme Cold, Hard Freeze, High Wind, Heavy Precipitation, Ice Storm (`harshWeather`).

An alert type that is already open is not inserted again.

## `historicWeather`

On boot, if `weather_days` is empty, reads `data/historic-weather.json` and inserts it, then builds `sap_daily` with `modelSapRows`. Flow uses the freeze-thaw model plus a stable per-tree factor and a small site offset. Weight accumulates until it hits the liquid cap, or the higher ice cap when the day never really thaws. The JSON is the sugaring-season daily rollup (15 Jan–30 Apr) of the NOAA station closest to Rochester in the class archive.

## `calendarService`

Uses the stored refresh token to call Google Calendar v3.

- `availabilityFor` posts free/busy on `primary` and returns suggested two-hour windows for the next week in `America/New_York` (`business/availability.js`).
- `syncSignup`, `syncWithdraw`, `syncSlotChange`, `syncSlotDelete` create, patch, or delete events. Failures are warnings. A Google outage does not undo the shift.
- `backfillUserCalendar` copies upcoming claimed shifts after the user connects Calendar.

Admin assignment responds first, then starts `syncSignup` without awaiting it.

## What stays out

`routes/collectionLogs.js`, `routes/journal.js`, `routes/alerts.js`, `routes/settings.js`, and most of `routes/schedule.js` call repositories directly. That is intentional: one table, one rule, no third-party call.
