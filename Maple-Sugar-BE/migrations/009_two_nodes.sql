-- The board follows the two Heltec nodes, not the old three-building set.
update node set tracked = node_code in ('NODE-001', 'NODE-002');
