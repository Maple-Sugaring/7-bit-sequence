import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth";
import { can, Capability } from "../business/permissions";
import { MainNav } from "./MainNav";

export function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { role } = useAuth();
  const canViewAlerts = can(role, Capability.VIEW_ALERTS);
  const onAlerts =
    pathname === "/notifications" || pathname.startsWith("/notifications/");

  return (
    <Box
      component="header"
      sx={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 1,
        px: { xs: 1.5, md: 3 },
        py: 1,
        bgcolor: "#000",
        color: "#fff",
        borderBottom: "4px solid #F76902",
      }}
    >
      <Typography
        component="button"
        onClick={() => navigate("/dashboard")}
        sx={{
          border: 0,
          bgcolor: "transparent",
          color: "#fff",
          font: "inherit",
          fontWeight: 650,
          fontSize: 18,
          letterSpacing: "-0.02em",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Maple Sugaring
      </Typography>
      <MainNav />
      {canViewAlerts ? (
        <IconButton
          aria-label="Notifications"
          aria-current={onAlerts ? "page" : undefined}
          onClick={() => navigate("/notifications")}
          sx={{
            color: "#fff",
            bgcolor: onAlerts ? "#F76902" : "transparent",
            "&hover": {
              bgcolor: onAlerts ? "#C75300" : "rgba(255,255,255,0.08",
            },
          }}
        >
          <NotificationsIcon />
        </IconButton>
      ) : (
        <Box />
      )}
    </Box>
  );
}
