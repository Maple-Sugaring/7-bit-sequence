import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { Gauge } from '@mui/x-charts/Gauge';
import { BsBattery } from "react-icons/bs";
import "../css/gauge.css"
/* Future Code for dynamic creation of Gauges
const BasicGauge = () => {
  return (
    <Stack direction={{ xs: 'row', md: 'row' }} spacing={{ xs: 1, md: 3 }} disableGutters>
       {Array.from({length: count }, (_, index) => (
         <Box sx={{ position: 'relative', width: "100%", height: "100%" }}>
           <Gauge sx={{postion:"absolute"}} width={100} height={100} value={60} startAngle={-90} endAngle={90} zindex={1}/>
           < BsBattery className="bat"/>
           <h3>Node 1</h3>
         </Box>
       ))}
     </Stack>
  )
}
*/

const BasicGauge = () => {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 3 }}>
      <Box sx={{ position: 'relative', width: 100, height: 100 }}>
        <Gauge sx={{postion:"absolute"}} width={100} height={100} value={60} startAngle={-90} endAngle={90} zindex={1}/>
        < BsBattery className="bat"/>
      </Box>
    </Stack>
  );
}

export { BasicGauge }