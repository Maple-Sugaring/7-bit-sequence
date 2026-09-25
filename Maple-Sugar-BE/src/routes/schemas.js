/**
 * Request shape validation.
 *
 * Shape only. Domain rules (plausible temperature ranges, sugar bands, shift
 * overlap) live in src/business so they can be reasoned about and tested without
 * an HTTP request, and so their error messages match the field-keyed map the
 * client form expects.
 */

import { z } from 'zod';

/** Path ids arrive as strings and must be positive integers. */
export const idParam = z.coerce.number().int().positive();

/** Query params are always strings, so booleans arrive as 'true' / 'false'. */
const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Must be a valid date and time.',
});

const nullableNumber = z.union([z.coerce.number(), z.null()]).optional();

export const metricsQuery = z.object({
  nodeId: z.coerce.number().int().positive().optional(),
  season: z.coerce.number().int().min(2000).max(2100).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

export const createMetricBody = z.object({
  NodeID: z.coerce.number().int().positive({ message: 'A tree must be selected.' }),
  BucketID: z.coerce.number().int().positive().nullish(),
  Recorded_At: isoDateTime.optional(),
  Weight: nullableNumber,
  Temperature: nullableNumber,
  Sugar_Percent: nullableNumber,
  Weather_Conditions: z.string().max(50).nullish(),
  Ice_Present: z.boolean().optional().default(false),
});

export const updateMetricBody = z
  .object({
    BucketID: z.coerce.number().int().positive().nullish(),
    Recorded_At: isoDateTime.optional(),
    Weight: nullableNumber,
    Temperature: nullableNumber,
    Sugar_Percent: nullableNumber,
    Weather_Conditions: z.string().max(50).nullish(),
    Ice_Present: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export const updateNodeBody = z.object({
  Status_Code: z.coerce.number().int().min(0).max(3).optional(),
  Node_Name: z.string().min(1).max(100).optional(),
  Stand: z.string().max(50).optional(),
  GatewayID: z.coerce.number().int().positive().nullish(),
  Battery_Percent: nullableNumber,
  Signal_Rssi: z.coerce.number().int().optional(),
  LoRa_Device_ID: z.string().max(64).optional(),
  Location: z.object({ lat: z.coerce.number(), lon: z.coerce.number() }).optional(),
});

export const flagNodeBody = z.object({
  type: z.string().min(1).max(50).default('Flagged'),
  description: z.string().max(2000).optional(),
});

export const alertsQuery = z.object({
  resolved: booleanish.optional(),
});

export const updateAlertBody = z.object({
  Is_Resolved: z.boolean(),
});

export const collectionLogsQuery = z.object({
  season: z.coerce.number().int().min(2000).max(2100).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

export const createCollectionLogBody = z.object({
  BucketID: z.coerce.number().int().positive(),
  NodeID: z.coerce.number().int().positive(),
  Volume_Collected: z.coerce.number().positive(),
  Collected_At: isoDateTime.optional(),
  Quality_Notes: z.string().max(2000).optional().default(''),
});

export const inviteUserBody = z.object({
  email: z.string().trim().min(1, 'An email address is required.').email('Enter a valid email address.'),
  roleId: z.coerce.number().int().min(1).max(3).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  accountExpiry: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Pick a valid date and time.' })
    .nullish(),
});

export const updateUserBody = z
  .object({
    RoleID: z.coerce.number().int().min(1).max(3).optional(),
    First_Name: z.string().max(100).optional(),
    Last_Name: z.string().max(100).optional(),
    Email: z.string().trim().email().optional(),
    Is_Active: z.boolean().optional(),
    Account_Expiry: z
      .union([
        z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
          message: 'Pick a valid date and time.',
        }),
        z.null(),
      ])
      .optional(),
    Google_Calendar_ID: z.string().max(255).nullish(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export const scheduleQuery = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

/** An admin assigns a student to buckets at a chosen time. A full bucket is not required. */
export const createSlotBody = z
  .object({
    Task: z.string().trim().min(1, 'Name the task.').max(100),
    Starts_At: isoDateTime,
    Ends_At: isoDateTime,
    UserID: z.coerce.number().int().positive({ message: 'Choose a student.' }),
    BucketIDs: z.array(z.coerce.number().int().positive()).min(1, 'Choose at least one bucket.'),
    Notes: z.string().max(500).optional().default(''),
  })
  .refine((body) => Date.parse(body.Ends_At) > Date.parse(body.Starts_At), {
    message: 'The shift must end after it starts.',
    path: ['Ends_At'],
  });

export const nodeActionBody = z.object({
  Action: z.enum(['collect', 'maintenance', 'online']),
  Notes: z.string().max(2000).optional(),
});

export const claimTimeBody = z
  .object({
    Starts_At: isoDateTime,
    Ends_At: isoDateTime,
  })
  .refine((body) => Date.parse(body.Ends_At) > Date.parse(body.Starts_At), {
    message: 'The shift must end after it starts.',
    path: ['Ends_At'],
  });

export const updateSlotBody = z
  .object({
    Task: z.string().min(1).max(100).optional(),
    Stand: z.string().min(1).max(50).optional(),
    Starts_At: isoDateTime.optional(),
    Ends_At: isoDateTime.optional(),
    Capacity: z.coerce.number().int().min(1).optional(),
    Is_Complete: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export const slotUserBody = z.object({
  userId: z.coerce.number().int().positive().optional(),
});

export const dailyWeatherQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  nodeId: z.coerce.number().int().positive().optional(),
});

export const createJournalBody = z.object({
  Title: z.string().trim().min(1, 'Give the entry a title.').max(200),
  Process_Notes: z.string().trim().min(1, 'Describe the collection.').max(8000),
  NodeID: z.coerce.number().int().positive().nullish(),
  BucketID: z.coerce.number().int().positive().nullish(),
  Collected_At: isoDateTime.optional(),
  Weight: nullableNumber,
  Sugar_Percent: nullableNumber,
  Ice_Present: z.boolean().optional().default(false),
});

const gatewayCode = z.string().trim().min(1, 'Name the gateway.').max(50);

/**
 * One sample from a load cell. Weight is gross pounds (bucket included).
 * The node is named the way the Pi knows it: a node code, a LoRa id, or the
 * database id.
 */
const ingestReadingObject = z.object({
  NodeID: z.coerce.number().int().positive().optional(),
  Node_Code: z.string().trim().min(1).max(50).optional(),
  LoRa_Device_ID: z.string().trim().min(1).max(64).optional(),
  Recorded_At: isoDateTime,
  Weight: z.coerce.number(),
  Sugar_Percent: nullableNumber,
  Weather_Conditions: z.string().max(50).nullish(),
  Ice_Present: z.boolean().optional().default(false),
  Battery_Percent: z.union([z.coerce.number().min(0).max(100), z.null()]).optional(),
  Signal_Rssi: z.union([z.coerce.number().int(), z.null()]).optional(),
});

function withNodeIdentity(schema) {
  return schema.refine(
    (reading) => reading.NodeID != null || Boolean(reading.Node_Code) || Boolean(reading.LoRa_Device_ID),
    { message: 'Name the node with Node_Code, LoRa_Device_ID, or NodeID.', path: ['Node_Code'] },
  );
}

export const ingestReadingBody = withNodeIdentity(ingestReadingObject);

/** A single reading, or a batch the gateway collected from several nodes. */
export const ingestBody = z.union([
  z.object({
    Gateway_Code: gatewayCode,
    Readings: z.array(ingestReadingBody).min(1).max(32),
  }),
  withNodeIdentity(ingestReadingObject.extend({ Gateway_Code: gatewayCode })),
]);

export const updateSettingsBody = z.object({
  Report_Interval_Minutes: z.coerce
    .number()
    .int()
    .min(1, 'Use at least 1 minute.')
    .max(1440, 'Use a day or less.'),
});
