/**
 * Yield and derived metrics (EIR-001, FR-003, FR-053).
 *
 * Load cells report gross weight, so every net figure has to subtract the
 * bucket's tare. Buckets are swappable, which is why tare comes from the
 * BUCKETS record rather than a constant.
 */

import { FINISHED_SUGAR_PERCENT, sapToSyrupRatio } from './sugarContent';

/** Liquid sap a bucket holds before it overflows. */
export const BUCKET_CAPACITY_GALLONS = 10;
/** Frozen sap can stack above the rim, so an iced bucket may weigh more. */
export const ICE_CAPACITY_GALLONS = 14;
/**
 * Raw sap is mostly water (about 2–3% sugar), so a gallon weighs about the
 * same as water. 10 gallons is 83.4 lb of sap. An empty 10 gallon bucket is
 * another 2–3 lb, so a full liquid bucket is about 85–86 lb on the scale.
 * Ice can stack above the rim and weigh more than this.
 */
export const LB_PER_GALLON = 8.34;
/** Net sap weight at the 10 gallon liquid line. */
export const BUCKET_CAPACITY_LB = BUCKET_CAPACITY_GALLONS * LB_PER_GALLON;
/** Net sap weight allowed when the bucket is tagged as icy. */
export const ICE_CAPACITY_LB = ICE_CAPACITY_GALLONS * LB_PER_GALLON;
/** Within this much of the liquid line, the bucket is treated as full. */
export const FULL_MARGIN_LB = 4;

export function netWeight(grossWeight, tareWeight = 0) {
  if (grossWeight == null) return null;
  return Math.max(0, grossWeight - tareWeight);
}

export function fillPercent(grossWeight, tareWeight = 0) {
  const net = netWeight(grossWeight, tareWeight);
  if (net == null) return null;
  return Math.max(0, (net / BUCKET_CAPACITY_LB) * 100);
}

export function isFull(grossWeight, tareWeight = 0) {
  const net = netWeight(grossWeight, tareWeight);
  if (net == null) return false;
  return net >= BUCKET_CAPACITY_LB - FULL_MARGIN_LB;
}

/** A negative net weight means the load cell lost the bucket entirely. */
export function isTipped(grossWeight, tareWeight = 0) {
  if (grossWeight == null) return false;
  return grossWeight < tareWeight * 0.5;
}

export function gallonsFromWeight(netLb) {
  if (netLb == null) return null;
  return netLb / LB_PER_GALLON;
}

/**
 * Water that must be boiled off to take sap from its raw sugar percentage to
 * finished syrup, expressed as a fraction of the starting volume (EIR-001).
 */
export function waterRemovalFraction(rawSugarPercent) {
  if (!rawSugarPercent || rawSugarPercent <= 0) return null;
  return Math.max(0, 1 - rawSugarPercent / FINISHED_SUGAR_PERCENT);
}

/**
 * Yield efficiency: finished syrup produced per gallon of sap, as a percent.
 * Higher starting sugar means less boiling and more syrup per gallon.
 */
export function yieldEfficiency(rawSugarPercent) {
  const ratio = sapToSyrupRatio(rawSugarPercent);
  if (!ratio) return null;
  return (1 / ratio) * 100;
}

/** Flow rate in pounds per hour between two consecutive readings. */
export function flowRate(previous, current) {
  if (!previous || !current) return null;
  const hours = (new Date(current.Recorded_At) - new Date(previous.Recorded_At)) / 3_600_000;
  if (hours <= 0) return null;

  const delta = current.Weight - previous.Weight;
  // A drop means the bucket was emptied, not that sap flowed backwards.
  if (delta < 0) return 0;
  return delta / hours;
}

/** Total sap collected across a set of COLLECTION_LOGS rows, in gallons. */
export function totalCollected(logs) {
  return logs.reduce((sum, log) => sum + (log.Volume_Collected ?? 0), 0);
}
