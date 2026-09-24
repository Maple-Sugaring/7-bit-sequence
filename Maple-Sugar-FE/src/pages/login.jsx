import * as React from "react";
import { useRef, useState, useEffect } from "react";
import mapleLogo from "../assets/MapleLogo.png";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import OutlinedInput from "@mui/material/OutlinedInput";
import InputLabel from "@mui/material/InputLabel";
import InputAdornment from "@mui/material/InputAdornment";
import FormControl from "@mui/material/FormControl";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import Button from "@mui/material/Button";
import Box from '@mui/material/Box';

//Style
import "../css/App.css";
import "../css/login.css";

export function Login() {
  const outlinedEmailId = React.useId();
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

  const userRef = useRef();
  const errRef = useRef();
  const [user, setUser] = useState('');
  const [pwd, setPwd] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    userRef.current.focus();
  }, [])

  useEffect(() => {
    setErrMsg('');
  }, [user, pwd])

  const handleSubmit = async (e) => {
    e.preventDefault();
  }

  return (
    <>
      <header className="login-header">
        <Box className="webTitle">
          <h1>Maple Sugaring</h1>
        </Box>
      </header>
      <main id="login-page">
        <div id="login-content">
          <div id="badge">
            <img id="login-img" src={mapleLogo} alt="RIT Maple Leaf" />
          </div>
          <h1>Login</h1>
          <Paper id="login-paper">
            <p 
              ref={errRef} 
              tabIndex={-1}                                 //Tab Index used for focus, set -1 so only focusable when called
              className={errMsg ? "errmsg" : "offscreen"} 
              aria-live="assertive"                         //For screen readers  
            >
              {errMsg}
            </p>
            <form onSubmit={handleSubmit}>
              {/* <TextField
                id="outlined-basic"
                label="Email"
                variant="outlined"
                size="small"
                fullWidth
              /> */}
              <FormControl fullWidth variant="outlined" className="field-with-label">
                <label htmlFor={`${outlinedEmailId}-input`} className="field-label">
                    Email
                </label>
                <OutlinedInput
                  id={`${outlinedEmailId}-input`}
                  placeholder="Enter your email.."
                  size="small"
                  inputRef={userRef}
                  onChange={(e) => setUser(e.target.value)}
                  value={user}
                  required
                />
              </FormControl>
              <FormControl fullWidth variant="outlined" className="field-with-label">
                <label htmlFor={`${outlinedPasswordId}-input`} className="field-label">
                    Password
                </label>
                {/* <InputLabel htmlFor={`${outlinedPasswordId}-input`} size="small">
                  Password
                </InputLabel> */}
                <OutlinedInput
                  id={`${outlinedPasswordId}-input`}
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password.."
                  size="small"
                  endAdornment={
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={
                          showPassword ? "hide the password" : "display the password"
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
                  onChange={(e) => setPwd(e.target.value)}
                  value={pwd}
                  required
                />
              </FormControl>
              <Button id="sign-in" type="submit" variant="contained" fullWidth>
                Sign In
              </Button>
{/*
  * Needs:
  *  onClick={handleForgotPassword}
  * 
  *  How do we handle a Password reset request
  */}
              <Button className="forgot-pswd" size="small">
                Forgot Password?
              </Button>
            </form>
          </Paper>
        </div>
      </main>
    </>
  );
}
