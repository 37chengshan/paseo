import { useLocation, useNavigate } from "@tanstack/react-router";
import { Languages } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  isLocale,
  LANGUAGE_NAMES,
  LOCALES,
  localizePath,
  splitLocalePath,
  useLocale,
} from "~/i18n";

/**
 * Switches the page to the same page in another language, keeping its query and hash so filters
 * and anchors survive. The URL carries the choice, so every link on the new page stays in it.
 */
export function LanguageSelector() {
  const { t } = useTranslation();
  const locale = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value;
      if (!isLocale(next) || next === locale) return;
      const { path } = splitLocalePath(location.pathname);
      const hash = location.hash ? `#${location.hash}` : "";
      void navigate({ href: `${localizePath(path, next)}${location.searchStr}${hash}` });
    },
    [locale, location.hash, location.pathname, location.searchStr, navigate],
  );
  return (
    <label className="relative inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{t("languageSelector.label")}</span>
      <select
        value={locale}
        onChange={onChange}
        className="appearance-none bg-transparent pr-1 cursor-pointer focus:outline-none focus-visible:underline"
      >
        {LOCALES.map((option) => (
          <option
            key={option}
            value={option}
            lang={option}
            className="bg-background text-foreground"
          >
            {LANGUAGE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
