import { queryAll } from '../db/pool.js';
import { mapGuide } from './mappers.js';

export async function listGuides() {
  const rows = await queryAll(`
    select guide_id, category, title, summary, steps
      from guides
     order by sort_order, title
  `);
  return rows.map(mapGuide);
}
