import { meterColors } from '../../theme/tokens';

export function batteryMeterColor(percent) {
  return percent < 20 ? meterColors.batteryLow : meterColors.batteryOk;
}

export function bucketMeterColor(fill) {
  return (fill ?? 0) >= 90 ? meterColors.bucketNearlyFull : meterColors.bucket;
}
