import * as settingsRepository from '../data/repositories/settingsRepository';

export function getSettings() {
  return settingsRepository.getSettings();
}

export function saveReportInterval(minutes) {
  return settingsRepository.updateReportInterval(minutes);
}
