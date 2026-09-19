import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { Gauge } from '@mui/x-charts/Gauge';
import BatteryStdIcon from '@mui/icons-material/BatteryStd';
import '../css/gauge.css';

export function BasicGauge({ value = 60 }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 3 }}>
      <Box sx={{ position: 'relative', width: 100, height: 100 }}>
        <Gauge width={100} height={100} value={clamped} startAngle={-90} endAngle={90} />
        <BatteryStdIcon className="bat" />
      </Box>
    </Stack>
  );
}
