//React Components
import { HashRouter as Router, Routes, Route, Outlet } from 'react-router-dom'
import { Login } from './pages/login'
import { Admin } from './pages/admin'
import { Dashboard } from './pages/dashboard'
import { Input } from './pages/input'
import { Notifications } from './pages/notifications'
import { Schedule_Admin } from './pages/schedule-admin'
import { Table } from './pages/table'
import { Schedule } from './pages/schedule'
import { Container } from '@mui/material'
import {Header} from './components/header'
import {Footer} from './components/footer'

//CSS styles
import './css/App.css'

function Layout() {
  return (
    <Container className="layout" disableGutters maxWidth={false} sx={{display:'flex', flexDirection:'column', flexGrow:1, margin:0, }}>
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
    </Container>
  )

  }

function App() {

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login/>}/>
        <Route element={<Layout />}>
          <Route path="/admin" element={<Admin/>}/>
          <Route path="/dashboard" element={<Dashboard/>}/>
          <Route path="/input" element={<Input/>}/>
          <Route path="/notifications" element={<Notifications/>}/>
          <Route path="/schedule-admin" element={<Schedule_Admin/>}/>
          <Route path="/schedule" element={<Schedule/>}/>
          <Route path="/table" element={<Table/>}/>
        </Route>
      </Routes>
    </Router>
  )
  
}

export default App
