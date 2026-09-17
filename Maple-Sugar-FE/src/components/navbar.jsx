import * as React from 'react';
import Box from '@mui/material/Box';
import RestoreIcon from '@mui/icons-material/Restore';
import FavoriteIcon from '@mui/icons-material/Favorite';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import { useNavigate, useLocation } from 'react-router-dom';

const Navbar = () => {
    const [value, setValue] = React.useState(0);

    const navigate = useNavigate(); //Utilize to change navbar paths on selection
    const location = useLocation(); //Read current path

    const handleChange = (event, newValue) => {
        navigate(newValue);
    };

  return (   
      <Box>
            <BottomNavigation value={location.pathname} onChange={handleChange} className="navbar" showLabels>

                <BottomNavigationAction 
                label="Home" value="/dashboard" icon={<RestoreIcon/>} sx={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap:1}}
                />

                <BottomNavigationAction 
                label="Schedule" value="/schedule" icon={<FavoriteIcon />} sx={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap:1}}/>

                <BottomNavigationAction 
                label="Input" value="/input" icon={<LocationOnIcon />} sx={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap:1}} 
                />

                <BottomNavigationAction 
                label="Table" value="/table" icon={<LocationOnIcon />} sx={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap:1}} 
                />
            </BottomNavigation>
      </Box>
  )
}

export { Navbar }