import { SHIFT_TASKS } from '../services/scheduleService';

/** Which shift task an alert should open on the schedule form. */
export function taskForAlert(alertType) {
  if (alertType === 'Low Battery') return 'Battery Swap';
  if (alertType === 'Signal Loss' || alertType === 'Node Offline' || alertType === 'Freezing') {
    return 'Sensor Check';
  }
  if (
    alertType === 'Full Bucket' ||
    alertType === 'Collection Needed' ||
    alertType === 'Spoilage' ||
    alertType === 'Tipped' ||
    alertType === 'Spill'
  ) {
    return 'Sap Collection';
  }
  return 'Maintenance';
}

/** Digits on the bucket barcode, so BKT-002 becomes 2. */
export function bucketNumber(barcode, nodeId) {
  const digits = String(barcode ?? '').match(/(\d+)/);
  if (digits) return String(Number(digits[1]));
  if (nodeId != null) return String(nodeId);
  return '?';
}

/** Short note for the shift form. The tree and task are already filled in. */
export function noteForAlert(alert) {
  if (alert?.Alert_Type === 'Full Bucket') {
    const number = bucketNumber(alert.barcode, alert.NodeID);
    const location = alert.stand || alert.nodeName || 'the sugarbush';
    return `Bucket - ${number} is full at ${location}.`;
  }
  if (alert?.Alert_Type === 'Spoilage') return 'Sap spoiling';
  if (alert?.Alert_Type === 'Tipped') return 'Bucket tipped';
  if (alert?.Alert_Type === 'Low Battery') return 'Low battery';
  if (alert?.Alert_Type === 'Signal Loss' || alert?.Alert_Type === 'Node Offline') return 'Node not reporting';
  return alert?.Alert_Type ?? '';
}

/** Schedule-admin URL with the tree, task, and a short note already chosen. */
export function schedulePathForAlert(alert) {
  const task = SHIFT_TASKS.includes(taskForAlert(alert?.Alert_Type))
    ? taskForAlert(alert.Alert_Type)
    : 'Maintenance';
  const params = new URLSearchParams();
  if (alert?.NodeID != null) params.set('nodeId', String(alert.NodeID));
  params.set('task', task);
  const notes = noteForAlert(alert);
  if (notes) params.set('notes', notes);
  return `/schedule-admin?${params.toString()}`;
}
