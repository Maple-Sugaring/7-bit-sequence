import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BoltIcon from '@mui/icons-material/Bolt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat';
import GoogleIcon from '@mui/icons-material/Google';
import GroupsIcon from '@mui/icons-material/Groups';
import LocalDrinkIcon from '@mui/icons-material/LocalDrink';
import ParkIcon from '@mui/icons-material/Park';
import RouterIcon from '@mui/icons-material/Router';
import SchoolIcon from '@mui/icons-material/School';
import ScienceIcon from '@mui/icons-material/Science';
import SensorsIcon from '@mui/icons-material/Sensors';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import mapleLogo from '../assets/MapleLogo.png';
import ritTigerLogo from '../assets/RITTigerTransparent.png';
import { MeterBar } from '../components/common/MeterBar';
import { Footer } from '../components/layout/Footer';
import { useAuth } from '../context/auth';
import { canVisit, landingRouteFor } from '../routes/navigation';
import { demoAccounts } from '../services/authService';
import { accessibleOrange, ritOrange, sugarbush } from '../theme/ritColors';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
const GOOGLE_START = `${API_BASE}/auth/google`;
const DEMO_ACCOUNTS = demoAccounts();

const TELEMETRY_PREVIEW = {
  nodeCode: 'BUSH_TOTAL',
  location: 'RIT Alumni House Sugarbush',
  gallons: 5.5,
  capacity: 10.0,
  percent: 55,
  meterColor: sugarbush.amber,
  statusLabel: '2 Active LoRa Nodes',
  shelfLife: '31h shortest batch',
  shelfLifeDetail: 'Timed per bucket batch across all active trees',
  brix: '2.25% avg',
  boilRatio: '38.2 : 1 avg',
  syrupEst: '0.15 gal syrup',
  battery: '91% fleet avg',
  rssi: '2/2 Nodes Online',
  tempDay: '38°F',
  tempNight: '24°F',
  flowState: 'Ideal Freeze-Thaw Window',
};

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Maple Tree Tap & Bucket',
    subtitle: 'Alumni House Sugarbush',
    description:
      'Sap flows during spring freeze-thaw cycles into food-grade buckets suspended from load-cell weight sensors on tapped campus maples.',
    badge: 'Load Cell + Tare Calibration',
    icon: ParkIcon,
  },
  {
    step: '02',
    title: 'Heltec WiFi LoRa 32 V3',
    subtitle: '915.125 MHz Field Node',
    description:
      'Weatherproof battery-powered nodes sample bucket weight and cell voltage, transmitting packets over sub-GHz LoRa (SF9, BW 125 kHz).',
    badge: 'LoRa Radio · Low Power',
    icon: SensorsIcon,
  },
  {
    step: '03',
    title: 'Raspberry Pi USB Gateway',
    subtitle: 'Edge Serial Forwarder',
    description:
      'A Heltec gateway board receives field transmissions and streams frames over USB serial to a Raspberry Pi, which posts to /api/ingest.',
    badge: 'USB Serial → HTTPS Ingest',
    icon: RouterIcon,
  },
  {
    step: '04',
    title: 'React & Express Cloud App',
    subtitle: 'Live Bush Dashboard',
    description:
      'Postgres and Redis back real-time bucket fill gauges, temperature-adjusted sap shelf-life timers, alerts, and volunteer shift schedules.',
    badge: 'Real-Time Alerts & Shifts',
    icon: CloudDoneIcon,
  },
];

const PROGRAM_ROLES = [
  {
    role: 'Student Volunteers',
    badge: 'Field Operations',
    accentColor: ritOrange,
    softBg: '#FFF4EC',
    icon: AgricultureIcon,
    summary:
      'Keep the sugarbush running smoothly between classes by claiming collection shifts and recording sap harvests right from your phone.',
    highlights: [
      'Check live bucket fill levels and batch shelf-life timers before walking to the bush',
      'Log harvested sap weight, refractometer Brix readings, and ice percentages on mobile',
      'Offline-ready collection queue automatically syncs entries when campus Wi-Fi returns',
    ],
  },
  {
    role: 'Maple Sugaring Society (MSS)',
    badge: 'Outreach & Research',
    accentColor: sugarbush.forest,
    softBg: sugarbush.forestSoft,
    icon: GroupsIcon,
    summary:
      'Explore seasonal sap flow patterns, sugar concentrations, and weather correlations across the RIT campus sugarbush.',
    highlights: [
      'Monitor "The Bush" live dashboard and interactive campus Fleet Map',
      'Filter historical node readings and Brix measurements in the Sugar Woods table',
      'Export clean CSV and PDF reports for club outreach, sustainability showcases, and labs',
    ],
  },
  {
    role: 'Program Administrators',
    badge: 'Fleet & Team Management',
    accentColor: sugarbush.amber,
    softBg: sugarbush.amberSoft,
    icon: AdminPanelSettingsIcon,
    summary:
      'Configure hardware nodes, coordinate volunteer schedules, and manage role-gated Google OAuth access for the RIT community.',
    highlights: [
      'Flash Heltec V3 firmware directly from the browser over Web Serial (esptool-js)',
      'Create, edit, and assign collection shifts linked to active tree alerts',
      'Invite @rit.edu and @g.rit.edu accounts with granular role and expiry controls',
    ],
  },
  {
    role: 'WINT-010 Students',
    badge: 'Maple Syrup & Environment',
    accentColor: accessibleOrange,
    softBg: '#FFF4EC',
    icon: SchoolIcon,
    summary:
      'Explore how maple syrup production connects to climate, forest ecology, invasive species, and sustainability through classroom learning and hands-on work in the woods.',
    highlights: [
      'Identify maple trees and learn how sap production responds to biology and weather',
      'Tap trees, harvest sap, and turn it into maple syrup while studying its history and economic significance',
      'Practice outdoor preparedness, leave-no-trace ethics, and winter snowshoe travel',
    ],
  },
];

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function LandingPage() {
  const { isAuthenticated, restoring, role, signIn } = useAuth();
  const [demoError, setDemoError] = useState(null);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const banner = searchParams.get('error');

  const activePreview = TELEMETRY_PREVIEW;

  useEffect(() => {
    if (location.pathname === '/login' || banner) {
      scrollToSection('sign-in-card');
    }
  }, [location.pathname, banner]);

  // The mock transport accepts any password for a seeded account.
  const signInAsDemo = async (email) => {
    setDemoError(null);
    try {
      await signIn({ email, password: 'mock' });
    } catch (error) {
      setDemoError(error.message);
    }
  };

  if (!restoring && isAuthenticated) {
    // A page remembered from the last session may belong to a different role.
    const from = location.state?.from;
    return <Navigate to={from && canVisit(role, from) ? from : landingRouteFor(role)} replace />;
  }

  return (
    <Box
      sx={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: sugarbush.cream,
        color: '#000',
        pb: { xs: 'calc(4.5rem + env(safe-area-inset-bottom))', md: 0 },
      }}
    >
      {/* Sticky Top Header (Web & Mobile) */}
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, sm: 3, md: 5 },
          py: 1.5,
          bgcolor: '#000',
          color: '#fff',
          borderBottom: `4px solid ${ritOrange}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            component="img"
            src={ritTigerLogo}
            alt="RIT tiger mascot"
            sx={{ width: 84, height: 84, objectFit: 'contain', flexShrink: 0 }}
          />
          <Box>
            <Typography
              sx={{
                fontWeight: 700,
                letterSpacing: '-0.02em',
                fontSize: { xs: 18, sm: 22 },
                lineHeight: 1.1,
              }}
            >
              Maple Sugaring
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: { xs: 'none', sm: 'block' },
                color: '#D0D3D4',
                fontSize: 11,
                letterSpacing: '0.02em',
              }}
            >
              Alumni House Sugarbush · Telemetry & Operations
            </Typography>
          </Box>
        </Stack>

        {/* Desktop quick section links */}
        <Stack
          component="nav"
          aria-label="Landing page sections"
          direction="row"
          spacing={1}
          sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}
        >
          <Button
            color="inherit"
            size="small"
            onClick={() => scrollToSection('telemetry-preview')}
            sx={{ color: '#F6F3F0', fontWeight: 500, '&:hover': { color: ritOrange } }}
          >
            Live Telemetry
          </Button>
          <Button
            color="inherit"
            size="small"
            onClick={() => scrollToSection('how-it-works')}
            sx={{ color: '#F6F3F0', fontWeight: 500, '&:hover': { color: ritOrange } }}
          >
            How It Works
          </Button>
          <Button
            color="inherit"
            size="small"
            onClick={() => scrollToSection('roles-overview')}
            sx={{ color: '#F6F3F0', fontWeight: 500, '&:hover': { color: ritOrange } }}
          >
            Get Involved
          </Button>
        </Stack>

      </Box>

      {/* Section 1: Hero & Embedded Sign-In */}
      <Box
        component="section"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          background: `radial-gradient(circle at 12% 18%, rgba(247, 105, 2, 0.14) 0%, rgba(217, 119, 6, 0.06) 38%, rgba(246, 243, 240, 0) 70%), linear-gradient(180deg, #FAF7F4 0%, ${sugarbush.cream} 100%)`,
          borderBottom: '1px solid #E2DDD7',
          py: { xs: 4, sm: 6, md: 8 },
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 4, md: 6 }} sx={{ alignItems: 'center' }}>
            {/* Left Column: Hero Narrative */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Stack spacing={3}>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Chip
                    icon={<ParkIcon sx={{ fontSize: 16 }} />}
                    label="RIT Alumni House Sugarbush"
                    size="small"
                    sx={{
                      bgcolor: sugarbush.forestSoft,
                      color: sugarbush.forest,
                      fontWeight: 700,
                      border: '1px solid rgba(45, 90, 39, 0.25)',
                    }}
                  />
                  <Chip
                    icon={<SensorsIcon sx={{ fontSize: 16 }} />}
                    label="915 MHz LoRa Telemetry"
                    size="small"
                    sx={{
                      bgcolor: '#FFF4EC',
                      color: accessibleOrange,
                      fontWeight: 700,
                      border: '1px solid rgba(247, 105, 2, 0.3)',
                    }}
                  />
                </Stack>

                <Typography
                  variant="h1"
                  sx={{
                    fontSize: { xs: '2.25rem', sm: '3rem', md: '3.5rem' },
                    fontWeight: 700,
                    lineHeight: 1.06,
                    letterSpacing: '-0.03em',
                    color: '#000',
                  }}
                >
                  Smart Sap Monitoring for the{' '}
                  <Box component="span" sx={{ color: accessibleOrange }}>
                    RIT Sugarbush
                  </Box>
                  .
                </Typography>

                <Typography
                  sx={{
                    fontSize: { xs: '1.02rem', sm: '1.15rem' },
                    lineHeight: 1.6,
                    color: '#3D3935',
                    maxWidth: '60ch',
                  }}
                >
                  Every spring at RIT’s Alumni House, tapped maples turn freeze-thaw weather into
                  fresh sap. Our wireless LoRa sensor network tracks bucket fill levels, batch
                  shelf life, and sugar content in real time—helping student volunteers harvest at
                  peak freshness.
                </Typography>

                {/* Key Highlight Pills (Mobile 1-col / Web 3-col) */}
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: '#fff',
                        borderRadius: 2.5,
                        border: '1px solid #E2DDD7',
                        height: '100%',
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                        <LocalDrinkIcon sx={{ color: ritOrange, fontSize: 20 }} />
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                          Live Bucket Fill
                        </Typography>
                      </Stack>
                      <Typography variant="caption" sx={{ color: '#4A4A4A', display: 'block' }}>
                        Load-cell weight to gallon conversion with overflow alerts.
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: '#fff',
                        borderRadius: 2.5,
                        border: '1px solid #E2DDD7',
                        height: '100%',
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                        <AccessTimeIcon sx={{ color: sugarbush.forest, fontSize: 20 }} />
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                          Batch Shelf Life
                        </Typography>
                      </Stack>
                      <Typography variant="caption" sx={{ color: '#4A4A4A', display: 'block' }}>
                        Spoilage clock timed per bucket using live local temperatures.
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: '#fff',
                        borderRadius: 2.5,
                        border: '1px solid #E2DDD7',
                        height: '100%',
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                        <CalendarMonthIcon sx={{ color: sugarbush.amber, fontSize: 20 }} />
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                          Volunteer Shifts
                        </Typography>
                      </Stack>
                      <Typography variant="caption" sx={{ color: '#4A4A4A', display: 'block' }}>
                        Claim collection shifts & log Brix tests even when offline.
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>

              </Stack>
            </Grid>

            {/* Right Column: Embedded Sign-In Card */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Box
                id="sign-in-card"
                sx={{
                  width: '100%',
                  scrollMarginTop: { xs: 76, md: 88 },
                  maxWidth: { xs: '100%', sm: 460 },
                  mx: 'auto',
                  bgcolor: '#fff',
                  border: '1px solid #D0D3D4',
                  borderTop: `6px solid ${ritOrange}`,
                  borderRadius: 3,
                  overflow: 'hidden',
                  boxShadow: '0 20px 50px rgba(28, 22, 19, 0.12)',
                }}
              >
                <Box sx={{ px: { xs: 3, sm: 4 }, pt: 4, pb: 2.5, textAlign: 'center' }}>
                  <Box
                    component="img"
                    src={mapleLogo}
                    alt=""
                    sx={{
                      width: 76,
                      height: 'auto',
                      mb: 1.5,
                      filter: `drop-shadow(0 6px 0 ${ritOrange})`,
                    }}
                  />
                  <Typography
                    variant="h2"
                    component="h2"
                    sx={{ fontSize: { xs: 28, sm: 34 }, fontWeight: 700, lineHeight: 1.1 }}
                  >
                    The sugarbush
                  </Typography>
                  <Typography sx={{ mt: 1, color: '#4A4A4A', fontSize: 15 }}>
                    Live taps at Alumni House, plus weather, alerts, and collection shifts.
                  </Typography>
                </Box>

                <Stack spacing={2} sx={{ px: { xs: 3, sm: 4 }, pb: 4 }}>
                  {restoring ? (
                    <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}>
                      <CircularProgress size={28} sx={{ color: '#000' }} />
                    </Box>
                  ) : (
                    <>
                      {banner ? <Alert severity="error">{banner}</Alert> : null}
                      {/* Mock mode has no API behind it, so Google sign-in would go nowhere. */}
                      {DEMO_ACCOUNTS.length ? null : (
                        <>
                          <Typography sx={{ color: '#4A4A4A', textAlign: 'center', fontSize: 14 }}>
                            Use your invited <strong>@rit.edu</strong> or{' '}
                            <strong>@g.rit.edu</strong> Google account to enter the bush.
                          </Typography>
                          <Button
                            variant="contained"
                            size="large"
                            href={GOOGLE_START}
                            startIcon={<GoogleIcon />}
                            fullWidth
                            sx={{ py: 1.4, fontSize: 16 }}
                          >
                            Sign in with Google
                          </Button>
                        </>
                      )}
                      {DEMO_ACCOUNTS.length ? (
                        <>
                          <Typography sx={{ color: '#4A4A4A', textAlign: 'center', fontSize: 14 }}>
                            Pick a role to explore the interactive demo. Everything here uses sample
                            sugarbush data.
                          </Typography>
                          <Divider sx={{ fontSize: 12, color: '#7C878E', fontWeight: 600 }}>
                            Mock data roles
                          </Divider>
                          {demoError ? <Alert severity="error">{demoError}</Alert> : null}
                          <Stack spacing={1.25}>
                            {DEMO_ACCOUNTS.map((account, index) => (
                              <Button
                                key={account.email}
                                variant={index === 0 ? 'contained' : 'outlined'}
                                color={index === 0 ? 'primary' : 'secondary'}
                                onClick={() => signInAsDemo(account.email)}
                                fullWidth
                                sx={{
                                  py: 1.25,
                                  fontWeight: 600,
                                  justifyContent: 'center',
                                }}
                              >
                                Continue as {account.label}
                              </Button>
                            ))}
                          </Stack>
                        </>
                      ) : null}
                    </>
                  )}
                </Stack>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* WINT-010 course overview */}
      <Box
        component="section"
        id="wint-010-class"
        sx={{
          scrollMarginTop: { xs: 76, md: 88 },
          py: { xs: 6, md: 9 },
          bgcolor: sugarbush.espresso,
          color: '#fff',
        }}
      >
        <Container maxWidth="md">
          <Typography
            variant="overline"
            sx={{ color: ritOrange, fontWeight: 800, letterSpacing: '0.08em' }}
          >
            WINT-010
          </Typography>
          <Typography
            variant="h2"
            sx={{ fontSize: { xs: 28, sm: 36 }, fontWeight: 700, color: '#fff', mt: 0.5, mb: 2 }}
          >
            Maple Syrup and Our Environment
          </Typography>
          <Typography sx={{ color: '#F6F3F0', lineHeight: 1.75, mb: 2 }}>
            This class will explore maple syrup production—both by way of micro production and as
            the yield of larger scale agriculture—as the product of a delicately strung web of
            environmental factors. As such, this hands-on and in-the-woods exploration of how maple
            syrup is produced will involve integrally related environmental topics and issues such
            as climate change, forest ecology, invasive species, and broader issues of
            sustainability.
          </Typography>
          <Typography sx={{ color: '#F6F3F0', lineHeight: 1.75 }}>
            Through both classroom lecture and practical exercises in the woods, students will learn
            tree identification, the biology of sap production, the role of weather patterns,
            nutritional benefits of maple syrup, and the history of maple syrup production and its
            economic significance. Students will learn and actually carry out the processes of
            identifying trees for tapping, harvesting sap, and converting the harvested sap into
            their very own maple syrup. Students will learn outdoor preparedness, leave no trace
            wilderness ethics, and use of snowshoes for winter foot-travel.
          </Typography>
        </Container>
      </Box>

      {/* Section 2: Interactive Sugarbush Telemetry Preview */}
      <Box
        component="section"
        id="telemetry-preview"
        sx={{
          scrollMarginTop: { xs: 76, md: 88 },
          py: { xs: 6, md: 9 },
          bgcolor: sugarbush.cream,
          borderBottom: '1px solid #E2DDD7',
        }}
      >
        <Container maxWidth="lg">
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={3}
            sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'flex-end' }, mb: 4 }}
          >
            <Box>
              <Typography
                variant="overline"
                sx={{ color: accessibleOrange, fontWeight: 800, letterSpacing: '0.08em' }}
              >
                Interactive Telemetry Preview
              </Typography>
              <Typography
                variant="h2"
                sx={{ fontSize: { xs: 26, sm: 34 }, fontWeight: 700, mt: 0.5 }}
              >
                See What the Bush Reports in Real Time
              </Typography>
              <Typography sx={{ color: '#4A4A4A', mt: 1, maxWidth: '62ch' }}>
                Sample readings across all active taps, including bucket capacity, sap shelf life,
                sugar content, and estimated syrup yield.
              </Typography>
            </Box>
          </Stack>

          {/* Telemetry Cards Grid */}
          <Grid container spacing={3}>
            {/* Card 1: Bucket Fill & Shelf Life */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 3,
                  border: '1px solid #D0D3D4',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.04)',
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}
                  >
                    <Box>
                      <Typography variant="caption" sx={{ color: '#4A4A4A', fontWeight: 700 }}>
                        {activePreview.nodeCode} · {activePreview.location}
                      </Typography>
                      <Typography variant="h3" sx={{ fontSize: 20, mt: 0.5 }}>
                        Bucket Fill & Shelf Life
                      </Typography>
                    </Box>
                    <Chip
                      label={activePreview.statusLabel}
                      size="small"
                      sx={{
                        bgcolor: '#FFF4EC',
                        color: accessibleOrange,
                        fontWeight: 700,
                      }}
                    />
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mt: 2 }}>
                    <Typography sx={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>
                      {activePreview.gallons.toFixed(1)}
                    </Typography>
                    <Typography sx={{ color: '#4A4A4A', fontWeight: 600 }}>
                      / {activePreview.capacity.toFixed(1)} gal ({activePreview.percent}%)
                    </Typography>
                  </Stack>

                  <MeterBar percent={activePreview.percent} color={activePreview.meterColor} />

                  <Box
                    sx={{
                      mt: 2.5,
                      p: 2,
                      borderRadius: 2,
                      bgcolor: sugarbush.cream,
                      border: '1px solid #E2DDD7',
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <AccessTimeIcon sx={{ fontSize: 18, color: sugarbush.forest }} />
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                        Batch Shelf Life: {activePreview.shelfLife}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: '#4A4A4A', display: 'block', mt: 0.5 }}>
                      {activePreview.shelfLifeDetail}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Card 2: Brix Sugar & Syrup Yield */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 3,
                  border: '1px solid #D0D3D4',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.04)',
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}
                  >
                    <Box>
                      <Typography variant="caption" sx={{ color: '#4A4A4A', fontWeight: 700 }}>
                        REFRACTOMETER & RULE OF 86
                      </Typography>
                      <Typography variant="h3" sx={{ fontSize: 20, mt: 0.5 }}>
                        Sugar Content & Yield
                      </Typography>
                    </Box>
                    <ScienceIcon sx={{ color: sugarbush.amber }} />
                  </Stack>

                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: sugarbush.amberSoft }}>
                        <Typography variant="caption" sx={{ color: '#4A4A4A', fontWeight: 700 }}>
                          Sap Sugar (Brix)
                        </Typography>
                        <Typography sx={{ fontSize: 26, fontWeight: 800, color: '#000', mt: 0.25 }}>
                          {activePreview.brix}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: sugarbush.forestSoft }}>
                        <Typography variant="caption" sx={{ color: '#4A4A4A', fontWeight: 700 }}>
                          Est. Syrup Yield
                        </Typography>
                        <Typography
                          sx={{ fontSize: 22, fontWeight: 800, color: sugarbush.forest, mt: 0.5 }}
                        >
                          {activePreview.syrupEst}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>

                  <Stack spacing={1} sx={{ mt: 2.5, pt: 2, borderTop: '1px solid #EBE7E2' }}>
                    <Stack
                      direction="row"
                      sx={{
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        columnGap: 2,
                        rowGap: 0.25,
                      }}
                    >
                      <Typography variant="body2" sx={{ color: '#4A4A4A' }}>
                        Sap-to-Syrup Boil Ratio
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0 }}>
                        {activePreview.boilRatio}
                      </Typography>
                    </Stack>
                    <Stack
                      direction="row"
                      sx={{
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        columnGap: 2,
                        rowGap: 0.25,
                      }}
                    >
                      <Typography variant="body2" sx={{ color: '#4A4A4A' }}>
                        Node Battery & Radio
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0 }}>
                        {activePreview.battery}
                      </Typography>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Card 3: Alumni House Weather & Sap Run Conditions */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 3,
                  border: '1px solid #D0D3D4',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.04)',
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}
                  >
                    <Box>
                      <Typography variant="caption" sx={{ color: '#4A4A4A', fontWeight: 700 }}>
                        ROCHESTER, NY · ALUMNI HOUSE
                      </Typography>
                      <Typography variant="h3" sx={{ fontSize: 20, mt: 0.5 }}>
                        Freeze-Thaw Microclimate
                      </Typography>
                    </Box>
                    <DeviceThermostatIcon sx={{ color: ritOrange }} />
                  </Stack>

                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                      alignItems: 'center',
                      p: 2,
                      borderRadius: 2,
                      bgcolor: sugarbush.cream,
                      border: '1px solid #E2DDD7',
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ color: '#4A4A4A', fontWeight: 600 }}>
                        Daytime Thaw
                      </Typography>
                      <Typography sx={{ fontSize: 28, fontWeight: 800, color: accessibleOrange }}>
                        {activePreview.tempDay}
                      </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ color: '#4A4A4A', fontWeight: 600 }}>
                        Overnight Freeze
                      </Typography>
                      <Typography sx={{ fontSize: 28, fontWeight: 800, color: '#000' }}>
                        {activePreview.tempNight}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack spacing={1} sx={{ mt: 2.5 }}>
                    <Stack
                      direction="row"
                      sx={{
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        columnGap: 1,
                        rowGap: 0.5,
                      }}
                    >
                      <Typography variant="body2" sx={{ color: '#4A4A4A' }}>
                        Run Forecast
                      </Typography>
                      <Chip
                        label={activePreview.flowState}
                        size="small"
                        sx={{
                          bgcolor: sugarbush.forestSoft,
                          color: sugarbush.forest,
                          fontWeight: 700,
                        }}
                      />
                    </Stack>
                    <Stack
                      direction="row"
                      sx={{
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        columnGap: 2,
                        rowGap: 0.25,
                      }}
                    >
                      <Typography variant="body2" sx={{ color: '#4A4A4A' }}>
                        LoRa Gateway Link
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0 }}>
                        {activePreview.rssi}
                      </Typography>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Section 3: "How It Works" Hardware-to-Cloud Pipeline */}
      <Box
        component="section"
        id="how-it-works"
        sx={{
          scrollMarginTop: { xs: 76, md: 88 },
          py: { xs: 6, md: 9 },
          bgcolor: sugarbush.espresso,
          color: '#fff',
          borderBottom: `4px solid ${ritOrange}`,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ mb: 5 }}>
            <Typography
              variant="overline"
              sx={{ color: ritOrange, fontWeight: 800, letterSpacing: '0.08em' }}
            >
              Architecture & Field Hardware
            </Typography>
            <Typography
              variant="h2"
              sx={{ fontSize: { xs: 26, sm: 34 }, fontWeight: 700, color: '#fff', mt: 0.5 }}
            >
              How a Drop of Sap Reaches the Dashboard
            </Typography>
            <Typography sx={{ color: '#D0D3D4', mt: 1, maxWidth: '64ch' }}>
              Built by RIT’s 7-Bit Sequence capstone team, the platform bridges off-grid maple trees
              at Alumni House to a role-gated cloud web app without relying on outdoor campus Wi-Fi.
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {PIPELINE_STEPS.map((item) => {
              const IconComponent = item.icon;
              return (
                <Grid key={item.step} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Box
                    sx={{
                      height: '100%',
                      p: 3,
                      borderRadius: 3,
                      bgcolor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box>
                      <Stack
                        direction="row"
                        sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
                      >
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            bgcolor: 'rgba(247, 105, 2, 0.18)',
                            color: ritOrange,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <IconComponent />
                        </Box>
                        <Typography
                          sx={{
                            fontSize: 24,
                            fontWeight: 800,
                            color: 'rgba(255, 255, 255, 0.28)',
                          }}
                        >
                          {item.step}
                        </Typography>
                      </Stack>

                      <Typography sx={{ fontWeight: 700, fontSize: 18, color: '#fff' }}>
                        {item.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: ritOrange, fontWeight: 700, display: 'block', mb: 1.5 }}
                      >
                        {item.subtitle}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#D0D3D4', lineHeight: 1.6 }}>
                        {item.description}
                      </Typography>
                    </Box>

                    <Box sx={{ mt: 2.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                        <BoltIcon sx={{ fontSize: 16, color: sugarbush.amber }} />
                        <Typography variant="caption" sx={{ color: '#F6F3F0', fontWeight: 600 }}>
                          {item.badge}
                        </Typography>
                      </Stack>
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Container>
      </Box>

      {/* Section 4: Program & Roles Overview */}
      <Box
        component="section"
        id="roles-overview"
        sx={{
          scrollMarginTop: { xs: 76, md: 88 },
          py: { xs: 6, md: 9 },
          bgcolor: '#FAF7F4',
          flex: 1,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ textAlign: { xs: 'left', md: 'center' }, mb: 5 }}>
            <Typography
              variant="overline"
              sx={{ color: accessibleOrange, fontWeight: 800, letterSpacing: '0.08em' }}
            >
              Built for the Campus Community
            </Typography>
            <Typography
              variant="h2"
              sx={{ fontSize: { xs: 26, sm: 34 }, fontWeight: 700, mt: 0.5 }}
            >
              One Sugarbush Platform, Three Tailored Views
            </Typography>
            <Typography
              sx={{
                color: '#4A4A4A',
                mt: 1,
                maxWidth: '64ch',
                mx: { xs: 0, md: 'auto' },
              }}
            >
              Whether you are hauling sap buckets at Alumni House, analyzing seasonal Brix trends
              with the Maple Sugaring Society, or flashing new Heltec nodes, your view adapts to your
              role.
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {PROGRAM_ROLES.map((item) => {
              const RoleIcon = item.icon;
              return (
                <Grid key={item.role} size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Card
                    sx={{
                      height: '100%',
                      borderRadius: 3,
                      border: '1px solid #D0D3D4',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 10px 28px rgba(0,0,0,0.04)',
                    }}
                  >
                    <CardContent sx={{ p: 3.5 }}>
                      <Stack
                        direction="row"
                        sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
                      >
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            bgcolor: item.softBg,
                            color: item.accentColor,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <RoleIcon />
                        </Box>
                        <Chip
                          label={item.badge}
                          size="small"
                          sx={{
                            bgcolor: item.softBg,
                            color: '#000',
                            fontWeight: 700,
                          }}
                        />
                      </Stack>

                      <Typography variant="h3" sx={{ fontSize: 21, fontWeight: 700, mb: 1 }}>
                        {item.role}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#4A4A4A', mb: 2.5, lineHeight: 1.6 }}>
                        {item.summary}
                      </Typography>

                      <Stack component="ul" spacing={1.25} sx={{ pl: 2, m: 0 }}>
                        {item.highlights.map((point) => (
                          <Typography
                            key={point}
                            component="li"
                            variant="body2"
                            sx={{ color: '#2B2825', lineHeight: 1.5 }}
                          >
                            {point}
                          </Typography>
                        ))}
                      </Stack>
                    </CardContent>

                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Container>
      </Box>

      {/* Consistent RIT Footer */}
      <Footer />

      {/* Mobile-Only Sticky Bottom Action Bar */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1200,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          px: 2,
          py: 1.25,
          pb: 'calc(0.75rem + env(safe-area-inset-bottom))',
          bgcolor: '#000',
          color: '#fff',
          borderTop: `3px solid ${ritOrange}`,
          boxShadow: '0 -6px 24px rgba(0,0,0,0.24)',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }} noWrap>
            RIT Sugarbush Portal
          </Typography>
          <Typography variant="caption" sx={{ color: '#D0D3D4', display: 'block' }} noWrap>
            {DEMO_ACCOUNTS.length ? 'Try a sample role instantly' : 'Sign in with RIT Google'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={() => scrollToSection('sign-in-card')}
          sx={{
            flexShrink: 0,
            px: 2.5,
            minHeight: 40,
            fontWeight: 700,
          }}
        >
          {DEMO_ACCOUNTS.length ? 'Try Demo' : 'Sign In'}
        </Button>
      </Box>
    </Box>
  );
}
