import Chip from '@mui/material/Chip';
import { STATUS_META } from '../../business/nodeMapStatus';
import { chipShapeSvg } from './statusGlyph';

/** The single way a node's status is drawn: label, palette colour and its own shape. */
export function NodeStatusChip({ status, size = 'small', ...props }) {
  const meta = STATUS_META[status];
  return (
    <Chip
      size={size}
      color={meta.color}
      label={meta.label}
      icon={
        <svg
          viewBox="0 0 28 28"
          width="16"
          height="16"
          aria-hidden="true"
          // Constant markup from chipShapeSvg, never user input.
          dangerouslySetInnerHTML={{ __html: chipShapeSvg(meta.shape) }}
        />
      }
      {...props}
    />
  );
}
