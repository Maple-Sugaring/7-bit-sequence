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
});

export const updateMetricBody = z
  .object({
    BucketID: z.coerce.number().int().positive().nullish(),
    Recorded_At: isoDateTime.optional(),
    Weight: nullableNumber,
    Temperature: nullableNumber,
    Sugar_Percent: nullableNumber,
    Weather_Conditions: z.string().max(50).nullish(),
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
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
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
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
      .nullish(),
    Google_Calendar_ID: z.string().max(255).nullish(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export const scheduleQuery = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

export const createSlotBody = z
  .object({
    Task: z.string().min(1, 'Select a task.').max(100),
    Stand: z.string().min(1, 'Select a stand.').max(50),
    Starts_At: isoDateTime,
    Ends_At: isoDateTime,
    Capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1.').default(2),
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
