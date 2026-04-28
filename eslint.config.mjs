import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.browser,
        firebase: "readonly",
        bootstrap: "readonly",
        Chart: "readonly",
        debug: "readonly",
        pdfjsLib: "readonly",
        WhatsAppQuickMessagesAutocomplete: "readonly",
        BadgeService: "readonly",
        showToast: "readonly",
        getCurrentFilters: "readonly",
        getSelectedPeriod: "readonly",
        displayReport: "readonly",
        closeColorEditor: "readonly",
        openSendTemplateModal: "readonly"
      }
    }
  }
]);
