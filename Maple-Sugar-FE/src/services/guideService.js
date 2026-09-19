import * as guidesRepository from '../data/repositories/guidesRepository';

/** Maintenance, installation, and calibration instructions (EIR-004). */

export async function getGuides() {
  const guides = await guidesRepository.listGuides();
  const categories = [...new Set(guides.map((guide) => guide.Category))].sort();
  return { guides, categories };
}
