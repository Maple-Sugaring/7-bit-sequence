# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


# Development

## Mobile layout preview

Run the app with sample data to explore every role without a backend or Google sign-in.
From this directory in PowerShell:

```powershell
$env:VITE_API_MODE = 'mock'
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Open http://127.0.0.1:5175 and choose a demo role. Below 1200px the app uses a
fixed bottom navigation bar and an **All pages** sheet. Wider windows use the
sidebar. Icons have text labels, and each role sees only its permitted pages.
Use a narrow browser window or your browser's device toolbar to review the mobile layout.
The demo uses sample data; it does not send collection or schedule changes to the live API.

## Dependencies

Utilizes Material UI and development requires the following installations:

    npm install @mui/material @emotion/react @emotion/styled

    npm install @mui/icons-material
