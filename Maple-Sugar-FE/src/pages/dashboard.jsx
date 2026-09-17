import { Container } from "@mui/material";
import { BasicGauge } from "../components/gauge";
import Box from "@mui/material/Box";
import "../css/dashboard.css";

export function Dashboard() {
  return (
    <>
      <main className="page-main">
        <h1>Dashboard</h1>
        {/* <Container className="battery" margin={0} disableGutters>
                <BasicGauge count={3}/>
            </Container> 
            Future code for implementing dynamic creation of new battery nodes
            */}
        <Container className="battery" disableGutters>
          <Box>
            <BasicGauge value="20" />
            <h3>Node 1</h3>
          </Box>
          <Box>
            <BasicGauge value="35" />
            <h3>Node 2</h3>
          </Box>
          <Box>
            <BasicGauge value="80" />
            <h3>Node 3</h3>
          </Box>
          <Box>
            <BasicGauge value="0" />
            <h3>Node 4</h3>
          </Box>
        </Container>
      </main>
    </>
  );
}
