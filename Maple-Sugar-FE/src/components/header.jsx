//Components
import * as React from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNavigate, useLocation } from 'react-router-dom';
import {Navbar} from '../components/navbar';

//Styles
import '../css/header.css'

const Header = () => {
    const [value, setValue] = React.useState(0);

    const navigate = useNavigate(); //Utilize to change navbar paths on selection
    const location = useLocation(); //Read current path
  return (
    <header className="header">
        <Box className="webTitle">
            <h1>Maple Sugaring</h1>
            <IconButton className="bell" value={"/notifications"} onClick={() => navigate("/notifications")} sx={{color:'white'}}>
              <NotificationsIcon sx={{fontSize:40}}/>
            </IconButton>
        </Box>
        <Navbar/>
    </header>
  )
}

export { Header }