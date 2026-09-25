import * as weatherRepository from '../data/repositories/weatherRepository';

export function getDailySeries(filters) {
  return weatherRepository.getDaily(filters);
}

export function getCompare(year) {
  return weatherRepository.getCompare(year);
}

export function getLiveWeather() {
  return weatherRepository.getLive();
}
