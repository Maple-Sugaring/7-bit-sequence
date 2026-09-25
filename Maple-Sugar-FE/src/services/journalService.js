import * as journalRepository from '../data/repositories/journalRepository';

export function getJournal() {
  return journalRepository.listEntries();
}

export function saveJournalEntry(entry) {
  return journalRepository.createEntry(entry);
}
