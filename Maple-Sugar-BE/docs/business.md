# Business layer

`src/business/` is pure domain code. It does not import Express, `pg`, or Google. The React app keeps parallel copies of the numbers that the UI must judge without a round trip (`permissions`, sugar bands, bucket capacity). If a constant changes, change both.

## `permissions.js`

Roles: Admin, Student, and MSS, keyed by `roles.id` 1, 2, and 3.

Admins are the instructors of the maple sugaring course at RIT. They are allowed to create users and assign shifts. It is the responsibility of admins to ensure that students in the maple sugaring class and MSS have accounts to use. Admin accounts do not expire.

Students are students enrolled in the maple sugaring course at RIT. They can see the dashboard, record data, export data, receive alerts, and view the schedule. They can also claim shifts, but the instructor will have to approve it before it can be added to the schedule. Student accounts will automatically deactivate (120?) days after creation.

MSS members are members of the Maple Sugaring Society at RIT. MSS accounts are designed to be "view only" for the data. They can see the dashboard and export data, but they cannot record data, view the schedule, or take any shifts. MSS accounts will automatically deactivate (1 year?) after creation.

`isAccountUsable` is false when `Is_Active` is false or `Account_Expiry` is in the past. Null expiry does not expire. When an account expires, the account is locked and is no longer listed as an active user. This is to ensure that there is not a huge backlog of unused accounts and that the application will only show active users to the instructor.

Capabilities are listed in [api.md](api.md). `can(role, capability)` is what route guards call.

## `season.js`

`seasonOf`: UTC month >= July belongs to the next calendar year. Matches SQL `sap_season()`.

## `thresholds.js`

| Constant | Value | Meaning |
| --- | --- | --- |
| `SPOILAGE_THRESHOLD_F` | 40 | Heat where raw sap spoils if it stays there. |
| `SAFE_THRESHOLD_F` | 34 | Effectively cold storage. |
| `CRITICAL_EXPOSURE_HOURS` | 4 | Hours above 40°F before a Spoilage alert. |
| `FINISHED_SUGAR_PERCENT` | 66.9 | Finished syrup. |
| `RAW_SAP_MIN_PERCENT` / `MAX` | 0.5 / 12 | Reject outside this. |
| `BUCKET_CAPACITY_GALLONS` | 10 | Liquid line. |
| `ICE_CAPACITY_GALLONS` | 14 | Allowed when `Ice_Present` is set. |
| `LB_PER_GALLON` | 8.6 | |
| `FULL_MARGIN_LB` | 4 | Net weight within this of the liquid line counts as full. |
| `MIN_TEMPERATURE_F` / `MAX` | -30 / 90 | Reject outside this on a manual reading. |
| `LOW_BATTERY_PERCENT` | 20 | |

`BUCKET_CAPACITY_LB` is `10 * 8.6`.

## `validation.js`

`validateReading` returns `{ errors, isValid }`. Errors block the write. The UI may also show warnings (typical sugar band); the API does not reject those.

Weight is gross pounds. Without ice, weight above the liquid cap plus 8 lb is rejected. With ice, the ceiling is the 14 gallon cap plus 8 lb. Sugar must fall between 0.5% and 12%. Readings cannot be timestamped in the future (one minute of clock skew is allowed).

`validateCollectionLog` requires a node, a bucket, and a positive volume.

## `alerting.js`

`deriveAlerts({ reading, history, tareWeight })` returns alert candidates. It does not write them.

- Spoilage: temperature above 40°F and `hoursAboveThreshold` of the recent history is at least 4 hours. A single warm afternoon does not alert.
- Full Bucket: net weight within 4 lb of 86 lb. The message is in gallons. Ice is called out when tagged, because the bucket can sit above 10 gallons.
- Tipped: gross weight under half the tare.

`metricsService` skips a type that is already open on that node.

## `sapFlow.js`

`sapRunFromTemps({ tempMinF, tempMaxF, precipIn })`.

Sap runs when the night is below 32°F and the day climbs back above freezing. A larger swing produces more flow, up to about 2.6 gallons per tree. Rain on a thaw adds a little flow and lowers sugar. A day that peaks at 55°F or more cuts the run. A day that never really thaws (`tempMax <= 34` and `tempMin <= 28`) is marked ice and the liquid flow is reduced.

Sugar on a run starts near 2.55% and falls as the afternoon warms or rain dilutes it.

`describeSapChange` compares today’s flow index with the previous live snapshot. An increase of 0.12, or the first freeze-thaw after a quiet day, is what raises the Sap Run alert.

## `sites.js`

Campus coordinates used for OpenWeather and for the small temperature offset in the historic model:

| Site | Latitude | Longitude | Offset °F |
| --- | --- | --- | --- |
| Alumni House | 43.084 | -77.6738 | +0.4 |
| Chabad House | 43.0849 | -77.6802 | 0 |
| Red Barn | 43.0897 | -77.6688 | -0.8 |

Live weather is still one campus reading. The offsets only nudge the modeled historic flow.

## `availability.js`

Sugarbush clock is `America/New_York`.

`suggestCollectionWindows` offers 8:00–10:00, 10:00–12:00, 12:00–14:00, 14:00–16:00, and 16:00–18:00 over the next seven days, skipping blocks that overlap Google busy time or that start within 30 minutes.

`validateChosenWindow` is the rule for a time the student typed themselves. Suggestions are not required. The window must be 30 minutes to 6 hours, not in the past, not more than three weeks out, and not overlapping a busy range.

## Hardware placement (operational, not a function)

One hub, indoors, near a window and a power outlet. One tracked node at each of the three sites above. Nodes cache readings on the device when the link drops; Postgres is the store the API reads. Export from Sugar Woods is the path out to another archive.
