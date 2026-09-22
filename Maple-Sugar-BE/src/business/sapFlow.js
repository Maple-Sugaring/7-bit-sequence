/**
 * Maple sap runs on a freeze-thaw cycle.
 *
 * A night below 32F builds pressure in the tree. A day that climbs back above
 * freezing, especially past 40F, lets that pressure push sap out the tap.
 * A bigger swing means a stronger run. Rain on a thaw adds volume and dilutes
 * sugar. A day that never really thaws leaves ice in the bucket instead of a
 * liquid run, and frozen sap can weigh more than the 10 gallon liquid line.
 */

import { LB_PER_GALLON } from './thresholds.js';

export function sapRunFromTemps({ tempMinF, tempMaxF, precipIn = 0 }) {
  const nightFreeze = tempMinF < 32;
  const dayThaw = tempMaxF > 32;
  const sapRun = nightFreeze && dayThaw;
  const ice = tempMaxF <= 34 && tempMinF <= 28;

  let flowGal = 0;
  if (sapRun) {
    const thaw = Math.min(1.4, Math.max(0, tempMaxF - 32) / 14);
    const freeze = Math.min(1.4, Math.max(0, 32 - tempMinF) / 16);
    flowGal = Math.min(2.6, 0.25 + thaw * freeze * 1.8);
    if (precipIn > 0.15 && tempMaxF > 33) flowGal = Math.min(2.8, flowGal * 1.12);
    if (tempMaxF >= 55) flowGal *= 0.55;
    if (ice) flowGal *= 0.65;
    flowGal = Math.round(flowGal * 100) / 100;
  }

  let sugar = null;
  if (sapRun) {
    sugar = 2.55 - Math.max(0, tempMaxF - 38) * 0.035 + (tempMinF < 15 ? 0.2 : 0);
    if (precipIn > 0.25) sugar -= 0.25;
    if (ice) sugar -= 0.1;
    sugar = Math.round(Math.min(3.3, Math.max(1.2, sugar)) * 100) / 100;
  }

  const flowIndex = Math.round(Math.min(1, flowGal / 2.6) * 1000) / 1000;

  return { sapRun, flowGal, sugar, ice, flowIndex };
}

/**
 * Compares today's run with the previous snapshot so a real change, not every
 * refresh, is what raises a sap-run alert.
 */
export function describeSapChange({ today, previous }) {
  if (!today?.sapRun) {
    return {
      flowChange: previous?.sapRun ? 'down' : 'steady',
      increased: false,
      summary: today
        ? `No sap run. The low is ${today.tempMinF}F and the high is ${today.tempMaxF}F, without a freeze followed by a thaw.`
        : 'Weather is unavailable.',
    };
  }

  const previousIndex = previous?.flowIndex ?? 0;
  const delta = today.flowIndex - previousIndex;
  const increased = !previous?.sapRun || delta >= 0.12;
  const flowChange = delta >= 0.12 ? 'up' : delta <= -0.12 ? 'down' : 'steady';
  const gallons = today.flowGal ?? Math.round(today.flowIndex * 2.6 * 100) / 100;

  const summary = increased
    ? `Sap run building. A low of ${today.tempMinF}F and a high of ${today.tempMaxF}F should move about ${gallons} gal per tree, up from the last reading.`
    : `Sap run holding. Freeze-thaw is in place (${today.tempMinF}F to ${today.tempMaxF}F), about ${gallons} gal per tree.`;

  return { flowChange, increased, summary };
}

export function poundsFromGallons(gallons) {
  return gallons * LB_PER_GALLON;
}
