import * as React from 'react';
import mapleLogo from '../assets/MapleLogo.png';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputLabel from '@mui/material/InputLabel';
import InputAdornment from '@mui/material/InputAdornment';
import FormControl from '@mui/material/FormControl';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import Button from '@mui/material/Button';

//Style
import '../css/App.css';
import '../css/login.css';

export function Login() {

    const outlinedPasswordId = React.useId();
    const [showPassword, setShowPassword] = React.useState(false);
    const handleClickShowPassword = () => setShowPassword((show) => !show);

    const handleMouseDownPassword = (event) => {
        event.preventDefault();
    };

    const handleMouseUpPassword = (event) => {
        event.preventDefault();
    };

    const infoEndAdornment = (
        <InputAdornment position="end">
        <InfoOutlined />
        </InputAdornment>
    );

    const infoStartAdornment = (
        <InputAdornment position="start">
        <InfoOutlined />
        </InputAdornment>
    );

    return (
        <>
            <div id="login-content">
                <img id="login-img" src={mapleLogo} alt="RIT Maple Leaf"/>
                <h1>Login</h1>
                <Paper id="login-paper">
                    <form>
                        <TextField id="outlined-basic" label="Email" variant="outlined" size="small" fullWidth/>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel htmlFor={`${outlinedPasswordId}-input`} size="small">Password</InputLabel>
                            <OutlinedInput
                                id={`${outlinedPasswordId}-input`}
                                type={showPassword ? 'text' : 'password'}
                                size="small"
                                endAdornment={
                                <InputAdornment position="end">
                                    <IconButton
                                    aria-label={
                                        showPassword ? 'hide the password' : 'display the password'
                                    }
                                    onClick={handleClickShowPassword}
                                    onMouseDown={handleMouseDownPassword}
                                    onMouseUp={handleMouseUpPassword}
                                    edge="end"
                                    >
                                    {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                                }
                                label="Password"
                            />
                        </FormControl>
                        <Button variant="contained" fullWidth>Sign In</Button>
                        <Button className="forgot-pswd" size="small">Forgot Password?</Button>
                    </form>
                </Paper>
            </div>
        </>
    )
}