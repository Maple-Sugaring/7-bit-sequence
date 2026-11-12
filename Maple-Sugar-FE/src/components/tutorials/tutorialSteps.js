import { Capability, can, Role, ROLE_LABELS } from '../../business/permissions';

/**
 * The Tutorials page: step-by-step walkthroughs on practice screens.
 *
 * Each step names the capability it needs, so a signed-in person only sees the
 * steps their role can actually do on the real page. `screen` picks a practice
 * screen from PracticeScreens.jsx and `target` is the spot on it to highlight
 * (null for a step with nothing to click). Text in `backticks` renders as code.
 */

const DEPLOY = Capability.DEPLOY_NODES;
const RECORD = Capability.RECORD_DATA;
const SCHEDULE = Capability.VIEW_SCHEDULE;
const CLAIM = Capability.CLAIM_SHIFT;
const MANAGE_SCHEDULE = Capability.MANAGE_SCHEDULE;

export const TUTORIAL_SECTIONS = [
  {
    id: 'ui',
    label: 'UI tutorials',
    description: 'How to use the Deploy, Collection, and Schedule pages.',
    tasks: [
      {
        id: 'deploy',
        label: 'Deploy',
        steps: [
          {
            title: 'Check your gateway',
            body: 'Gateways are the Raspberry Pi units that nodes report through. If none is listed, choose Register gateway first; its code must match the code set on the Pi. Use Chrome or Edge on a computer with a USB cable to flash.',
            capability: DEPLOY,
            screen: 'deploy',
            target: 'gateway',
          },
          {
            title: 'Start adding a node',
            body: 'Choose Add node. It stays unavailable until a gateway exists.',
            capability: DEPLOY,
            screen: 'deploy',
            target: 'add-node',
          },
          {
            title: 'Name the tree',
            body: 'Enter a tree name, then choose the stand and the gateway it reports through.',
            capability: DEPLOY,
            screen: 'add-node',
            target: 'tree-name',
          },
          {
            title: 'Mark its location',
            body: 'Click the map to drop a pin, or choose Use my location when you are standing at the tree.',
            capability: DEPLOY,
            screen: 'add-node',
            target: 'location',
          },
          {
            title: 'Save and continue',
            body: 'Seconds between packets sets how often the node reports: 10 for a live demo, 900 (15 minutes) in the field. Save and continue records the tree, then moves on to flashing.',
            capability: DEPLOY,
            screen: 'add-node',
            target: 'save-node',
          },
          {
            title: 'Flash the board',
            body: 'Plug in the Heltec and choose Flash. If the port does not appear, hold PRG, tap reset, then release PRG and try again.',
            capability: DEPLOY,
            screen: 'flash',
            target: 'flash',
          },
          {
            title: 'Tare the scale',
            body: 'With the platform empty, hold PRG for 3 seconds. The screen shows the node code after restart.',
            capability: DEPLOY,
            screen: 'tare',
            target: 'prg',
          },
          {
            title: 'Confirm it reports',
            body: 'After a few readings the node shows as Online.',
            capability: DEPLOY,
            screen: 'node-online',
            target: null,
          },
        ],
      },
      {
        id: 'collection',
        label: 'Collection',
        steps: [
          {
            title: 'Choose the tree',
            body: 'Open Collection. Tree buttons are grouped by stand. Pick the bucket you just emptied; “This round” counts how many trees you have logged. A round label is optional.',
            capability: RECORD,
            screen: 'collection',
            target: 'trees',
          },
          {
            title: 'Check the weight',
            body: 'The weight is the only required field. It is filled in from the sensor reading, so change it only if your scale says something different.',
            capability: RECORD,
            screen: 'collection',
            target: 'weight',
          },
          {
            title: 'Add Brix if you tested',
            body: 'Sugar content is optional. Fill it in only if you tested the sap with a refractometer.',
            capability: RECORD,
            screen: 'collection',
            target: 'brix',
          },
          {
            title: 'Mark ice',
            body: 'Switch on Ice in the bucket if there was ice. Use Add a note for anything unusual, or Collected earlier? to change the time.',
            capability: RECORD,
            screen: 'collection',
            target: 'ice',
          },
          {
            title: 'Check the estimate',
            body: 'The app estimates the syrup this bucket will make, using that tree’s last sugar test.',
            capability: RECORD,
            screen: 'collection',
            target: 'estimate',
          },
          {
            title: 'Save',
            body: 'Save & next tree moves to the next bucket; Save & stop here ends the round. Entries made without signal wait in your browser and upload when you reconnect.',
            capability: RECORD,
            screen: 'collection',
            target: 'save',
          },
          {
            title: 'Confirm it saved',
            body: 'Saved entries appear in this round’s list. Ones saved without signal say Waiting to upload until you reconnect.',
            capability: RECORD,
            screen: 'collection-saved',
            target: null,
          },
        ],
      },
      {
        id: 'schedule',
        label: 'Schedule',
        steps: [
          {
            title: 'Browse the shifts',
            body: 'Use the buttons (All, My shifts, Open, Completed), the Stand and Task filters, and View past. Shifts without a time sit under “Needs a time.”',
            capability: SCHEDULE,
            screen: 'schedule',
            target: 'filters',
          },
          {
            title: 'Pick a time',
            body: 'On a shift that needs a time, choose Pick a time. If Google Calendar is disconnected, sign in again and grant calendar access first.',
            capability: CLAIM,
            screen: 'schedule',
            target: 'pick-time',
          },
          {
            title: 'Choose a free window',
            body: 'The open windows come from your connected Google Calendar, so they skip times you are busy. Choosing one claims the shift.',
            capability: CLAIM,
            screen: 'pick-time',
            target: 'window',
          },
          {
            title: 'Check your calendar',
            body: 'The shift shows a “You” badge once it is claimed. Check your Google Calendar for the event.',
            capability: CLAIM,
            screen: 'shift-claimed',
            target: null,
          },
          {
            title: 'Faculty: create a shift',
            body: 'Admins see Manage shifts. Choose New shift to open the form.',
            capability: MANAGE_SCHEDULE,
            screen: 'schedule',
            target: 'new-shift',
          },
          {
            title: 'Faculty: post or assign',
            body: 'Pick a task, then leave Student blank to post an open shift, or choose a student to assign it. Set times, open spots, and a note, then post. Each shift card also has Mark complete and a delete button.',
            capability: MANAGE_SCHEDULE,
            screen: 'new-shift',
            target: 'post-shift',
          },
        ],
      },
    ],
  },
  {
    id: 'hardware',
    label: 'Hardware fixes',
    description: 'Fixes at the tree: recalibrating a scale that reads wrong, and getting a solar-powered node reporting again.',
    tasks: [
      {
        id: 'recalibration',
        label: 'Recalibration',
        steps: [
          {
            title: 'Open the calibration card',
            body: 'On the tree’s page, find Calibrate the scale. It works over the radio, no cable: tare the empty platform, calibrate with a known weight, then check the reading.',
            capability: DEPLOY,
            screen: 'calibration',
            target: 'card',
          },
          {
            title: 'Clear any fault first',
            body: 'A load-cell fault turns off Tare and Calibrate. It means a missing reading, a stuck or open wire, or a reading that jumps more than 5 lb, so check the load-cell cable and HX711 wiring. An unstable fault means the platform is moving; steady it and wait.',
            capability: DEPLOY,
            screen: 'calibration-fault',
            target: 'fault',
          },
          {
            title: 'Speed up the steps',
            body: 'Each step reaches the node on its next packet. On Deploy, note the tree’s current packet interval and set it to 10 seconds while you calibrate. Restore the previous interval when you are done.',
            capability: DEPLOY,
            screen: 'interval',
            target: 'interval',
          },
          {
            title: 'Tare with the platform empty',
            body: 'Take the bucket and anything else off the platform, make sure it is still, then choose Tare. A platform that is still moving fails the step instead of storing a bad zero.',
            capability: DEPLOY,
            screen: 'calibration',
            target: 'tare',
          },
          {
            title: 'Wait for the node to confirm',
            body: 'The card shows the command is waiting for the node. A missed packet just costs one more interval. Cancel stops a command that is still waiting; sending a new one replaces it.',
            capability: DEPLOY,
            screen: 'calibration-waiting',
            target: 'waiting',
          },
          {
            title: 'Calibrate with a known weight',
            body: 'Set a known weight in the middle of the platform, enter exactly what it weighs, and choose Calibrate. It fails if the reading barely moves from the tare, which usually means nothing is on the platform.',
            capability: DEPLOY,
            screen: 'calibration-weight',
            target: 'calibrate',
          },
          {
            title: 'Check the reading',
            body: 'Only readings taken after the node confirms count. If the scale reads under half the test weight, the card asks you to put the weight back on rather than calibrate again. Hang the bucket back on when you are done.',
            capability: DEPLOY,
            screen: 'calibration-check',
            target: 'check',
          },
          {
            title: 'No signal? Calibrate over USB',
            body: 'At the tree, plug a laptop into the USB-C jack and open a serial monitor at 115200 baud (press PRG first if the node is asleep). Send `TARE` with the platform empty, then `CAL` and the test weight in pounds. A four-cell platform needs `CAL` once after flashing.',
            capability: DEPLOY,
            screen: 'usb-calibrate',
            target: 'terminal',
          },
        ],
      },
      {
        id: 'solar',
        label: 'Solar fixes',
        steps: [
          {
            title: 'Spot a power problem',
            body: 'A low battery, or a tree that stopped reporting on time, usually means the pack is low. If the battery is missing entirely, the node is not seeing a pack at all.',
            capability: DEPLOY,
            screen: 'solar-tree',
            target: 'battery',
          },
          {
            title: 'Wake the node',
            body: 'Press PRG once. For about 2 minutes the screen shows the node code, the pack percentage and voltage, the weight, and the seconds to the next report.',
            capability: DEPLOY,
            screen: 'solar-wake',
            target: 'prg',
          },
          {
            title: 'Screen says USB? Reseat the pack',
            body: 'The solar kit’s 18650 pack must plug into the lithium battery port underneath the board. If the screen shows USB instead of a percentage, the board is not seeing a pack, so reseat that lead.',
            capability: DEPLOY,
            screen: 'solar-usb',
            target: 'port',
          },
          {
            title: 'Check the panel and pack',
            body: 'Clear snow, leaves, or shade from the 5 W panel. Below 3.15 V the node sends nothing and sleeps an hour at a time; below 3.30 V it sleeps at least 30 minutes between reports, or longer if its configured interval is longer. It recovers on its own once the pack charges 100 mV past those levels, or swap in a charged 18650.',
            capability: DEPLOY,
            screen: 'solar-kit',
            target: 'kit',
          },
          {
            title: 'Don’t trust a reading on USB',
            body: 'A pack charging over USB reads its charge voltage, so it shows close to 100%. Unplug USB before you judge the battery level.',
            capability: DEPLOY,
            screen: 'solar-charging',
            target: 'charging',
          },
          {
            title: 'Correct a wrong battery reading',
            body: 'If the percentage disagrees with a multimeter, measure the pack, press PRG to wake the node, connect a laptop at 115200 baud, and send `BATCAL` with the voltage in millivolts. Future readings are scaled to match.',
            capability: DEPLOY,
            screen: 'battery-calibrate',
            target: 'terminal',
          },
        ],
      },
    ],
  },
];

/** The roles that can do a step, e.g. "Administrator, MSS Member". */
export function rolesLabel(capability) {
  return Object.values(Role)
    .filter((role) => can(role, capability))
    .map((role) => ROLE_LABELS[role])
    .join(', ');
}

/**
 * The sections, tasks, and steps one role can use. Tasks left with no steps,
 * and sections left with no tasks, are dropped.
 */
export function tutorialsFor(role) {
  return TUTORIAL_SECTIONS.map((section) => ({
    ...section,
    tasks: section.tasks
      .map((task) => ({ ...task, steps: task.steps.filter((step) => can(role, step.capability)) }))
      .filter((task) => task.steps.length > 0),
  })).filter((section) => section.tasks.length > 0);
}
