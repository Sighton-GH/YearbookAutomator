import { DocumentationPage } from "./DocumentationPage";

/**
 * HowToUsePage is now an alias for DocumentationPage.
 * All documentation content is in DocumentationPage.tsx
 * This file is kept for backward compatibility with routing.
 */
export function HowToUsePage() {
  return <DocumentationPage />;
}
