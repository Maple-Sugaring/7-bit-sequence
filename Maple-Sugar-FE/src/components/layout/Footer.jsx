import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useNavigate } from 'react-router-dom';
import ritLogo from '../../assets/RITLogo.png';
import { useAuth } from '../../context/auth';
import { Capability } from '../../business/permissions';
import '../../css/footer.css';

export function Footer() {
  const { can, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <footer>
      <Box className="fbox">
        <img src={ritLogo} alt="Rochester Institute of Technology" className="footer-logo" />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {can(Capability.MANAGE_SCHEDULE) ? (
            <Button color="inherit" onClick={() => navigate('/schedule-admin')} sx={{ color: '#F76902' }}>
              Schedule Admin
            </Button>
          ) : null}
          {can(Capability.MANAGE_USERS) ? (
            <Button color="inherit" onClick={() => navigate('/admin')} sx={{ color: '#F76902' }}>
              Admin
            </Button>
          ) : null}
          <Button color="inherit" onClick={handleSignOut} sx={{ color: '#F76902' }}>
            Log out
          </Button>
          <p>Copyright 2026</p>
        </Box>
      </Box>
    </footer>
  );
}
