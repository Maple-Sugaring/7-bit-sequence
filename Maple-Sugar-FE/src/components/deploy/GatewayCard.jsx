import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import ParkOutlinedIcon from '@mui/icons-material/ParkOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { gatewayLook, sincePostText } from './gatewayStyle';
import { useNow } from './useNow';

function Fact({ icon: Icon, children }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Icon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />
      <Typography variant="body2" color="text.secondary" noWrap>
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * One gateway on the Deploy page. `nodeCount` is how many trees report through
 * it; `onOpen` is set only for people who may edit.
 */
export function GatewayCard({ gateway, nodeCount, onOpen }) {
  const { accent, icon: Icon } = gatewayLook(gateway.GatewayID);
  const now = useNow(1000);
  const online = gateway.Status === 'Online';
  const statusColor = online ? 'success.main' : 'text.disabled';

  const body = (
    <>
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          color: accent,
          bgcolor: alpha(accent, 0.12),
        }}
      >
        <Icon />
      </Box>

      <Box sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700, lineHeight: 1.25 }}>
            {gateway.Gateway_Name}
          </Typography>
          <Box
            aria-hidden
            sx={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              flexShrink: 0,
              bgcolor: statusColor,
            }}
          />
        </Stack>
        <Typography
          variant="caption"
          sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: accent, fontWeight: 600 }}
        >
          {gateway.Gateway_Code}
        </Typography>

        <Stack spacing={0.25} sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ color: statusColor, fontWeight: 600 }}>
            {online ? 'Online' : 'Offline'}
          </Typography>
          <Fact icon={ScheduleIcon}>
            {gateway.Last_Seen ? `Last post ${sincePostText(gateway.Last_Seen, now)}` : 'No posts yet'}
          </Fact>
          <Fact icon={ParkOutlinedIcon}>
            {nodeCount === 0 ? 'No trees yet' : `${nodeCount} ${nodeCount === 1 ? 'tree' : 'trees'}`}
          </Fact>
          {gateway.Notes ? <Fact icon={NotesOutlinedIcon}>{gateway.Notes}</Fact> : null}
        </Stack>
      </Box>

      {onOpen ? <ChevronRightIcon sx={{ color: 'text.disabled', alignSelf: 'center' }} /> : null}
    </>
  );

  const shared = {
    display: 'flex',
    gap: 1.5,
    p: 1.75,
    pl: 2.25,
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2,
    bgcolor: 'background.paper',
    // The accent runs down the left edge, so each card reads as its own.
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: '0 auto 0 0',
      width: 5,
      bgcolor: accent,
      opacity: online ? 1 : 0.4,
    },
  };

  if (!onOpen) return <Box sx={shared}>{body}</Box>;

  return (
    <ButtonBase
      onClick={onOpen}
      aria-label={`Edit gateway ${gateway.Gateway_Name}`}
      sx={{
        ...shared,
        alignItems: 'stretch',
        textAlign: 'left',
        transition: 'border-color 120ms',
        '&:hover, &:focus-visible': {
          borderColor: accent,
        },
      }}
    >
      {body}
    </ButtonBase>
  );
}
