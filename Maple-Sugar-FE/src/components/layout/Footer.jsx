import Box from '@mui/material/Box';
import ritLogo from '../../assets/RITLogo.png';
import '../../css/footer.css';

export function Footer() {
  return (
    <footer>
      <Box className="fbox">
        <img src={ritLogo} alt="Rochester Institute of Technology" className="footer-logo" />
        <p>Alumni House Sugarbush · © {new Date().getFullYear()} RIT Maple Sugaring</p>
      </Box>
    </footer>
  );
}
