import { Container } from '@mui/material';
import Box from '@mui/material/Box';
import { BasicGauge } from '../components/gauge';
import '../css/dashboard.css';

export function DashboardPage() {
  return (
    <>
      <h1>Dashboard</h1>
      <Container className="battery" disableGutters>
        <Box>
          <BasicGauge />
          <h3>Node 1</h3>
        </Box>
        <Box>
          <BasicGauge />
          <h3>Node 2</h3>
        </Box>
        <Box>
          <BasicGauge />
          <h3>Node 3</h3>
        </Box>
        <Box>
          <BasicGauge />
          <h3>Node 4</h3>
        </Box>
      </Container>
    </>
  );
}
