
//Components
import Box from '@mui/material/Box';
import ritLogo from '../assets/RITLogo.png';

//Styles
import '../css/footer.css'

const Footer = () => {

    return (
        <footer>
            <Box className="fbox">
                <img src={ritLogo} alt="Rochester Institute of Technology" className="footer-logo" />
                <p>Copyright 2026</p>
            </Box>
        </footer>
    );
    

}

export { Footer }