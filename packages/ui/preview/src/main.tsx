import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PreviewGallery } from "../../src/preview/index";
import { previews } from "./previews/index";

import "./styles.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("preview: #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <PreviewGallery
      previews={previews}
      tweaker={{
        locales: ["en", "ar", "fr", "ur"],
        roles: ["owner", "admin", "member"],
        productThemes: ["q9", "recruiter", "kaadr"],
      }}
    />
  </StrictMode>,
);
