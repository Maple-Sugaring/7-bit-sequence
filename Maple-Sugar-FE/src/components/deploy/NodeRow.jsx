import BatteryStdIcon from '@mui/icons-material/BatteryStd';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ParkIcon from '@mui/icons-material/Park';
import RouterOutlinedIcon from '@mui/icons-material/RouterOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { dateTime, decibels } from '../common/format';

function Fact({ icon: Icon, children }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Icon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
      <Typography variant="body2" color="text.secondary" noWrap>
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * One deployed tree as a full-width row. The accent follows its status, and
 * every node shares one icon. `status` is { label, color } from the page.
 */
export function NodeRow({ node, status, gatewayName, canDeploy, onOpen, onEdit, onMore }) {
  const color = status.color === 'default' ? 'grey' : status.color;
  const accentOf = (theme) => (color === 'grey' ? theme.palette.grey[500] : theme.palette[color].main);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { sm: 'center' },
        gap: 1.5,
        p: 1.75,
        pl: 2.25,
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: '0 auto 0 0',
          width: 5,
          bgcolor: accentOf,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            color: accentOf,
            bgcolor: (theme) => alpha(accentOf(theme), 0.12),
          }}
        >
          <ParkIcon />
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
              {node.Node_Name}
            </Typography>
            <Chip size="small" label={status.label} color={status.color} />
            <Typography
              variant="caption"
              sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600, color: 'text.secondary' }}
            >
              {node.Node_Code}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {node.Stand}
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 0.75, flexWrap: 'wrap', rowGap: 0.25 }}>
            <Fact icon={RouterOutlinedIcon}>{gatewayName ?? 'No gateway'}</Fact>
            <Fact icon={BatteryStdIcon}>
              {node.Battery_Percent == null ? '—' : `${Math.round(node.Battery_Percent)}%`}
            </Fact>
            <Fact icon={SignalCellularAltIcon}>{decibels(node.Signal_Rssi)}</Fact>
            <Fact icon={ScheduleIcon}>{dateTime(node.Last_Seen)}</Fact>
          </Stack>
        </Box>
      </Stack>

      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
        <Button size="small" onClick={onOpen}>
          Open tree
        </Button>
        {canDeploy ? (
          <>
            <Button size="small" startIcon={<EditOutlinedIcon />} onClick={onEdit}>
              Edit
            </Button>
            <IconButton aria-label={`More actions for ${node.Node_Name}`} onClick={onMore}>
              <MoreVertIcon />
            </IconButton>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}
