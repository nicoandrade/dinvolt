"use client";

import {
  ArrowUpRight,
  ChevronsUpDown,
  ExternalLink,
  Maximize,
  Menu,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Tablet,
} from "lucide-react";
import Image from "next/image";
import { useState, useSyncExternalStore } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { catalogItems } from "./catalog-items";
import { examples, publicExamples, publicHome } from "./examples";
import { GalleryNavigation } from "./gallery-navigation";

import "./gallery.css";

const navigationEvent = "dinvolt:playground:navigate";

const subscribeToLocation = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  window.addEventListener(navigationEvent, notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener(navigationEvent, notify);
  };
};
const getLocationSearch = () => window.location.search;
const getServerSearch = () => null;

const navigate = (changes: Record<string, string | null>) => {
  const next = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) {
      next.searchParams.delete(key);
    } else {
      next.searchParams.set(key, value);
    }
  }
  if (next.href !== window.location.href) {
    window.history.pushState(
      null,
      "",
      `${next.pathname}${next.search}${next.hash}`
    );
    window.dispatchEvent(new Event(navigationEvent));
  }
};

function choose(id: string) {
  navigate({ section: id === "showcase" ? null : id, scenario: null });
}

// eslint-disable-next-line complexity -- Preserve existing orchestration branches during the lint migration.
export function Gallery() {
  // Preview selection belongs to browser history. Prerender the controls and
  // wait for the hydrated URL before mounting an iframe, avoiding a wrong preview request.
  const query = useSyncExternalStore(
    subscribeToLocation,
    getLocationSearch,
    getServerSearch
  );
  const params = new URLSearchParams(query ?? "");
  const area = params.get("profile") === "public" ? "public" : "admin";
  const areaExamples = area === "admin" ? examples : publicExamples;
  const section = params.get("section") ?? "showcase";
  const selected =
    section === publicHome.id ||
    catalogItems.some((item) => `ui:${item.id}` === section) ||
    areaExamples.some((item) => item.id === section)
      ? section
      : "showcase";
  const scenarioId = params.get("scenario") ?? "default";
  const dark = params.get("theme") === "dark";
  const viewport = params.get("viewport") ?? "full";
  const width = ["1440", "768", "390"].includes(viewport) ? viewport : "full";
  const [search, setSearch] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const example = areaExamples.find((item) => item.id === selected);
  const component = catalogItems.find((item) => `ui:${item.id}` === selected);
  const scenario =
    example?.scenarios.find((item) => item.id === scenarioId) ??
    example?.scenarios[0];
  const isPublicHome = selected === publicHome.id;
  const title = isPublicHome
    ? publicHome.title
    : (example?.title ?? component?.title ?? "Showcase");
  const profile =
    isPublicHome || area === "public" ? "Public · Luma" : "Admin · Vega";
  const componentId = component?.id ?? "showcase";
  const url = isPublicHome
    ? dark
      ? "/?theme=dark"
      : "/"
    : example
      ? scenario?.id === "live"
        ? example.id === "users"
          ? "/admin/users"
          : example.id === "home"
            ? "/admin/home"
            : "/admin"
        : `${area === "admin" ? "/preview" : "/public-preview"}/${example.id}?scenario=${scenario?.id}&theme=${dark ? "dark" : "light"}`
      : `${area === "admin" ? "/preview/catalog" : "/public-preview"}/${componentId}?theme=${dark ? "dark" : "light"}`;
  const source = isPublicHome
    ? publicHome.source
    : (example?.source ??
      (component
        ? component.id === "spinner"
          ? "catalog/registry/shared/spinner/spinner.tsx"
          : `catalog/ui/components/${area}/ui/${component.id === "form" ? "field" : component.id}.tsx`
        : "playground/showcase/"));
  const selectExample = (id: string) => {
    choose(id);
    setNavigationOpen(false);
  };
  const selectProfile = (value: string) => {
    navigate({
      profile: value === "admin" ? null : "public",
      ...(example && !publicExamples.some((item) => item.id === example.id)
        ? { section: null, scenario: null }
        : {}),
    });
  };
  const navigation = (
    <GalleryNavigation
      area={area}
      onChoose={selectExample}
      onProfile={selectProfile}
      onSearch={setSearch}
      search={search}
      selected={selected}
    />
  );

  return (
    <div className="dv-shell">
      <a className="dv-skip" href="#preview-workspace">
        Skip to preview
      </a>
      <header className="dv-header">
        <div className="dv-header-start">
          <Sheet onOpenChange={setNavigationOpen} open={navigationOpen}>
            <SheetTrigger
              aria-label="Open navigation"
              className="dv-icon-button dv-mobile-menu"
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <SheetContent className="dv-drawer" side="left">
              <SheetHeader className="dv-drawer-header">
                <SheetTitle>Browse components</SheetTitle>
                <SheetDescription className="sr-only">
                  Choose a profile and an example to preview.
                </SheetDescription>
              </SheetHeader>
              {navigation}
            </SheetContent>
          </Sheet>
          {/* eslint-disable-next-line nextjs/no-html-link-for-pages -- A full reload resets the internal preview and its worker state. */}
          <a className="dv-brand" href="/playground">
            <Image
              alt="Dinvolt"
              className="dv-logo"
              height={34}
              loading="eager"
              src="/dinvolt-logo.svg"
              width={153}
            />
            <span className="dv-brand-divider" aria-hidden="true">
              /
            </span>
            <span className="dv-badge">Playground</span>
          </a>
        </div>
        <div className="dv-header-actions">
          <a
            className="dv-reference"
            href="https://ui.shadcn.com"
            rel="noreferrer"
            target="_blank"
          >
            shadcn/ui <ArrowUpRight aria-hidden="true" />
          </a>
          <a className="dv-open" href={url} rel="noreferrer" target="_blank">
            Open preview <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </header>
      <div className="dv-workspace">
        <aside aria-label="Component navigation" className="dv-sidebar">
          {navigation}
        </aside>
        <main
          aria-label="Component gallery"
          className="dv-main"
          id="preview-workspace"
          tabIndex={-1}
        >
          <div className="dv-preview-header">
            <div className="dv-preview-heading">
              <h1>{title}</h1>
              <span className="dv-profile-badge">{profile}</span>
            </div>
            <fieldset aria-label="Preview options" className="dv-toolbar">
              {example && (
                <label className="dv-state">
                  <span>State</span>
                  <select
                    onChange={(event) =>
                      navigate({ scenario: event.target.value })
                    }
                    title={scenario?.hint}
                    value={scenario?.id}
                  >
                    {example.scenarios.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                  <ChevronsUpDown aria-hidden="true" />
                </label>
              )}
              <fieldset
                aria-label="Viewport"
                className="dv-segmented dv-viewports"
              >
                {[
                  { id: "full", label: "Responsive", Icon: Maximize },
                  { id: "1440", label: "Desktop", Icon: Monitor },
                  { id: "768", label: "Tablet", Icon: Tablet },
                  { id: "390", label: "Mobile", Icon: Smartphone },
                ].map(({ id, label, Icon }) => (
                  <button
                    aria-label={`${label} viewport`}
                    aria-pressed={width === id}
                    className="dv-icon-button"
                    key={id}
                    onClick={() =>
                      navigate({ viewport: id === "full" ? null : id })
                    }
                    title={
                      id === "full"
                        ? "Fit to available space"
                        : `${label} · ${id}px`
                    }
                    type="button"
                  >
                    <Icon aria-hidden="true" />
                  </button>
                ))}
              </fieldset>
              <span aria-hidden="true" className="dv-toolbar-divider" />
              <fieldset aria-label="Theme" className="dv-segmented">
                <button
                  aria-label="Light theme"
                  aria-pressed={!dark}
                  className="dv-icon-button"
                  onClick={() => navigate({ theme: null })}
                  title="Light theme"
                  type="button"
                >
                  <Sun aria-hidden="true" />
                </button>
                <button
                  aria-label="Dark theme"
                  aria-pressed={dark}
                  className="dv-icon-button"
                  onClick={() => navigate({ theme: "dark" })}
                  title="Dark theme"
                  type="button"
                >
                  <Moon aria-hidden="true" />
                </button>
              </fieldset>
            </fieldset>
          </div>
          <div className="dv-canvas" data-theme={dark ? "dark" : "light"}>
            {query === null ? (
              <div aria-hidden="true" className="dv-placeholder dv-frame" />
            ) : (
              // eslint-disable-next-line react/iframe-missing-sandbox -- Trusted same-origin previews need their real scripts, forms and service worker.
              <iframe
                className="dv-frame"
                key={url}
                onLoad={(event) =>
                  event.currentTarget.contentDocument?.documentElement.classList.toggle(
                    "dark",
                    dark
                  )
                }
                src={url}
                style={{ width: width === "full" ? "100%" : `${width}px` }}
                title={`${title}: ${profile}`}
              />
            )}
          </div>
          <footer className="dv-footer">
            <code title={source}>{source}</code>
            <span>
              {isPublicHome
                ? "Public website"
                : example
                  ? scenario?.id === "live"
                    ? "Real authentication"
                    : "Local preview"
                  : "Component preview"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
