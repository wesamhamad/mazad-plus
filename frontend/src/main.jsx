import React from "react";
import { createRoot } from "react-dom/client";

// The DGA Platforms Code design tokens, straight from the published package.
import "@maldarabseh/dga-tokens/css/dga.css";
// IBM Plex Sans Arabic — the typeface the DGA design system specifies.
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
// Our component layer composed on top of those tokens.
import "./styles/app.css";
import "./styles/auth.css";
import "./styles/value.css";
import "./styles/services.css";

import App from "./App";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
