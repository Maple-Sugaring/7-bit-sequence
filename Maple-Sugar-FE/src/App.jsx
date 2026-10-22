import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { BrowserRouter } from 'react-router-dom';
import { TourProvider } from './components/tour/TourProvider';
import { AuthProvider } from './context/AuthProvider';
import { AppRoutes } from './routes/AppRoutes';
import { ColorModeProvider } from './theme/ColorModeProvider';
import './css/App.css';

export default function App() {
  return (
    <ColorModeProvider>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <BrowserRouter>
          <AuthProvider>
            <TourProvider>
              <AppRoutes />
            </TourProvider>
          </AuthProvider>
        </BrowserRouter>
      </LocalizationProvider>
    </ColorModeProvider>
  );
}
