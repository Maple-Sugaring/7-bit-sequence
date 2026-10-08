import * as notificationsRepository from '../data/repositories/notificationsRepository';

export function sendTestEmail() {
  return notificationsRepository.sendTestEmail();
}
