/**
 * Row mappers: snake_case Postgres columns to the exact field names the
 * frontend reads.
 *
 * The names on the right-hand side are a contract. They match the ER model and
 * the mock transport's fixtures, which is what lets the client swap
 * VITE_API_MODE between `mock` and `http` without touching a repository. A
 * rename here is a breaking API change.
 */

/** Timestamps go out as ISO 8601, which is what dayjs parses on the client. */
function iso(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Date-only fields stay date-only. Queries cast these to text in SQL so the
 * driver cannot reinterpret a bare date in the server's local zone and shift
 * it a day; this is just a passthrough guard for anything that slips by.
 */
function dateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function num(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapRole(row) {
  return {
    RoleID: row.id,
    Role_Name: row.role_name,
  };
}

export function mapUser(row) {
  return {
    UserID: row.id,
    RoleID: row.role_id,
    First_Name: row.first_name ?? '',
    Last_Name: row.last_name ?? '',
    Email: row.email,
    Created_At: dateOnly(row.created_at),
    Last_Login: iso(row.last_login),
    Is_Active: row.is_active,
    Account_Expiry: iso(row.account_expiry),
    Google_Calendar_ID: row.google_calendar_id ?? null,
    Calendar_Connected: Boolean(row.calendar_connected),
    Invite_Pending: row.invite_pending ?? false,
  };
}

/**
 * The baseline schema defaults gateway status to the string 'active', while the
 * UI renders a binary Online/Offline chip. Anything not explicitly live is
 * reported as Offline, since a gateway in an unknown state is not one you
 * should trust to be relaying.
 */
const ONLINE_STATUSES = new Set(['online', 'active', 'up']);

export function mapGateway(row) {
  return {
    GatewayID: row.id,
    Gateway_Name: row.gateway_name ?? row.gateway_code,
    Last_Seen: iso(row.last_ping),
    Status: ONLINE_STATUSES.has(String(row.status ?? '').toLowerCase()) ? 'Online' : 'Offline',
  };
}

export function mapNode(row) {
  const lat = num(row.latitude);
  const lon = num(row.longitude);

  return {
    NodeID: row.id,
    LoRa_Device_ID: row.lora_device_id ?? row.node_code,
    GatewayID: row.gateway_id,
    Node_Name: row.node_name ?? row.node_code,
    Status_Code: row.status_code,
    Battery_Percent: num(row.battery_level),
    Signal_Rssi: row.signal_rssi,
    // Nested rather than flat: the device page passes this straight to a map
    // link, and a node with no recorded siting must be distinguishable from one
    // sited at the equator.
    Location: lat == null || lon == null ? null : { lat, lon },
    Stand: row.stand ?? null,
    Last_Seen: iso(row.last_seen),
    Report_Interval_Seconds: row.report_interval_seconds ?? null,
    Tracked: Boolean(row.tracked),
  };
}

export function mapBucket(row) {
  return {
    BucketID: row.id,
    Barcode_ID: row.barcode_id,
    NodeID: row.node_id,
    Status: row.status,
    Tare_Weight: num(row.tare_weight),
  };
}

export function mapMetric(row) {
  return {
    MetricID: row.id,
    NodeID: row.node_id,
    BucketID: row.bucket_id,
    Recorded_By_UserID: row.recorded_by_user_id,
    Recorded_At: iso(row.recorded_at),
    Weight: num(row.weight),
    Temperature: num(row.temperature),
    Sugar_Percent: num(row.sugar_percent),
    Weather_Conditions: row.weather_conditions ?? null,
    Ice_Present: Boolean(row.ice_present),
  };
}

export function mapAlert(row) {
  return {
    AlertID: row.id,
    NodeID: row.node_id,
    Alert_Type: row.alert_type,
    // The baseline calls this `message`; the UI column is Description.
    Description: row.message ?? '',
    Created_At: iso(row.created_at),
    Is_Resolved: row.is_resolved,
  };
}

export function mapCollectionLog(row) {
  return {
    LogID: row.id,
    BucketID: row.bucket_id,
    UserID: row.user_id,
    NodeID: row.node_id,
    Collected_At: iso(row.collected_at),
    Volume_Collected: num(row.volume_collected),
    Quality_Notes: row.quality_notes ?? '',
  };
}

export function mapScheduleSlot(row) {
  return {
    SlotID: row.id,
    Task: row.task,
    Stand: row.stand,
    Starts_At: iso(row.starts_at),
    Ends_At: iso(row.ends_at),
    Capacity: row.capacity,
    // Aggregated from schedule_assignments. Coalesced to an empty array so the
    // client can map over it without a null check on every unclaimed shift.
    Alert_ID: row.alert_id ?? null,
    Node_ID: row.node_id ?? null,
    Notes: row.notes ?? '',
    Bucket_IDs: row.bucket_ids ?? [],
    Bucket_Labels: row.bucket_labels ?? [],
    Awaiting_Time: row.starts_at == null,
    Assigned_UserIDs: row.assigned_user_ids ?? [],
    // Same assignments, resolved to display names so the schedule can label a
    // shift without pulling the admin-only user roster. Shape: { userId, name, email }.
    Assignees: row.assignees ?? [],
    Is_Complete: row.is_complete,
  };
}

export function mapGuide(row) {
  return {
    GuideID: row.guide_id,
    Category: row.category,
    Title: row.title,
    Summary: row.summary,
    Steps: row.steps ?? [],
  };
}
