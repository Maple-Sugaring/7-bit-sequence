import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import { STATUS_META, STATUS_ORDER } from '../../business/nodeMapStatus';
import { shapeSvg, STATUS_HEX } from './statusMarker';

// The same shape the marker uses, so the legend explains the map. Input is constant.
function StatusGlyph({ status }) {
  const meta = STATUS_META[status];
  return (
    <svg
      viewBox="0 0 28 28"
      width="20"
      height="20"
      aria-hidden="true"
      style={{ marginLeft: 8 }}
      dangerouslySetInnerHTML={{ __html: shapeSvg(meta.shape, STATUS_HEX[meta.color]) }}
    />
  );
}

/** Status chips with counts. In `interactive` mode they toggle a status filter. */
export function FleetMapLegend({ counts, active, onToggle, noLocation = 0, compact = false }) {
  const interactive = Boolean(onToggle);
  return (
    <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap' }} role="group" aria-label="Status legend">
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const selected = !active || active.size === 0 || active.has(status);
        return (
          <Chip
            key={status}
            size={compact ? 'small' : 'medium'}
            icon={<StatusGlyph status={status} />}
            label={`${meta.label} ${counts[status] ?? 0}`}
            onClick={interactive ? () => onToggle(status) : undefined}
            aria-pressed={interactive ? active?.has(status) ?? false : undefined}
            variant={selected ? 'filled' : 'outlined'}
            sx={{
              minHeight: interactive && !compact ? 36 : undefined,
              opacity: selected ? 1 : 0.6,
            }}
          />
        );
      })}
      {noLocation > 0 ? (
        <Chip size={compact ? 'small' : 'medium'} variant="outlined" label={`No location ${noLocation}`} />
      ) : null}
    </Stack>
  );
}
