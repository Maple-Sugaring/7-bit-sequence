/**
 * Yield and derived metrics (EIR-001, FR-003, FR-053).
 *
 * Load cells report gross weight, so every net figure has to subtract the
 * bucket's tare. Buckets are swappable, which is why tare comes from the
 * BUCKETS record rather than a constant.
 */

import { FINISHED_SUGAR_PERCENT, sapToSyrupRatio } from './sugarContent';

/** Weight at which a standard bucket overflows, in pounds. */
export const BUCKET_CAPACITY_LB = 18;
/** Within this much of capacity, the bucket is treated as full (FR-003). */
export const FULL_MARGIN_LB = 1.5;
/** Sap weighs roughly this much per gallon at sap-season temperatures. */
export const LB_PER_GALLON = 8.6;

export function netWeight(grossWeight, tareWeight = 0) {
  if (grossWeight == null) return null;
  return Math.max(0, grossWeight - tareWeight);
}

export function fillPercent(grossWeight, tareWeight = 0) {
  const net = netWeight(grossWeight, tareWeight);
  if (net == null) return null;
  const usable = BUCKET_CAPACITY_LB - tareWeight;
  return Math.min(100, Math.max(0, (net / usable) * 100));
}

export function isFull(grossWeight, tareWeight = 0) {
  const net = netWeight(grossWeight, tareWeight);
  if (net == null) return false;
  return net >= BUCKET_CAPACITY_LB - tareWeight - FULL_MARGIN_LB;
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
