"use client";

import {
  ChevronDown,
  Component,
  House,
  LayoutDashboard,
  Layers,
  LayoutGrid,
  Search,
  X,
} from "lucide-react";

import { catalogItems } from "./catalog-items";
import { examples, publicExamples, publicHome } from "./examples";

interface GalleryNavigationProps {
  area: "admin" | "public";
  selected: string;
  search: string;
  onSearch: (value: string) => void;
  onChoose: (id: string) => void;
  onProfile: (value: string) => void;
}

export function GalleryNavigation({
  area,
  selected,
  search,
  onSearch,
  onChoose,
  onProfile,
}: GalleryNavigationProps) {
  const query = search.trim().toLowerCase();
  const areaExamples = area === "admin" ? examples : publicExamples;
  const visibleExamples = areaExamples.filter((item) =>
    item.title.toLowerCase().includes(query)
  );
  const visibleComponents = catalogItems.filter((item) =>
    item.title.toLowerCase().includes(query)
  );
  const showShowcase = "showcase".includes(query);
  const showHome = publicHome.title.toLowerCase().includes(query);
  const empty =
    !showShowcase &&
    !showHome &&
    !visibleExamples.length &&
    !visibleComponents.length;

  return (
    <div className="dv-navigation">
      <div className="dv-sidebar-top">
        <label className="dv-profile">
          <span>Profile</span>
          <select
            onChange={(event) => onProfile(event.target.value)}
            value={area}
          >
            <option value="admin">Admin · Vega</option>
            <option value="public">Public · Luma</option>
          </select>
          <ChevronDown aria-hidden="true" />
        </label>
        <label className="dv-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search components</span>
          <input
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Find a component…"
            type="search"
            value={search}
          />
        </label>
      </div>
      <nav aria-label="Examples" className="dv-navigation-scroll">
        {showShowcase && (
          <div className="dv-group dv-overview">
            <button
              aria-current={selected === "showcase" ? "page" : undefined}
              onClick={() => onChoose("showcase")}
              type="button"
            >
              <LayoutGrid aria-hidden="true" />
              Showcase
            </button>
          </div>
        )}
        {showHome && (
          <div className="dv-group">
            <p>
              <House aria-hidden="true" /> Public site
            </p>
            <button
              aria-current={selected === publicHome.id ? "page" : undefined}
              onClick={() => onChoose(publicHome.id)}
              type="button"
            >
              {publicHome.title}
            </button>
          </div>
        )}
        {[
          { id: "Administration", title: "Admin panel", Icon: LayoutDashboard },
          { id: "Components", title: "Dinvolt", Icon: Layers },
        ].map(({ id, title, Icon }) => {
          const items = visibleExamples.filter((item) => item.group === id);
          return items.length > 0 ? (
            <div className="dv-group" key={id}>
              <p>
                <Icon aria-hidden="true" /> {title}
                <span>{items.length}</span>
              </p>
              {items.map((item) => (
                <button
                  aria-current={item.id === selected ? "page" : undefined}
                  key={item.id}
                  onClick={() => onChoose(item.id)}
                  type="button"
                >
                  {item.id === "spinner" ? "Dinvolt spinner" : item.title}
                </button>
              ))}
            </div>
          ) : null;
        })}
        {visibleComponents.length > 0 && (
          <div className="dv-group">
            <p>
              <Component aria-hidden="true" /> Components{" "}
              <span>{visibleComponents.length}</span>
            </p>
            {visibleComponents.map((item) => (
              <button
                aria-current={`ui:${item.id}` === selected ? "page" : undefined}
                key={item.id}
                onClick={() => onChoose(`ui:${item.id}`)}
                type="button"
              >
                {item.title}
              </button>
            ))}
          </div>
        )}
        {empty && (
          <output className="dv-empty">
            <Search aria-hidden="true" />
            <p>No results found</p>
            <span>Try a different component name.</span>
            <button onClick={() => onSearch("")} type="button">
              <X aria-hidden="true" /> Clear search
            </button>
          </output>
        )}
      </nav>
      <div className="dv-sidebar-footer">
        <span className="dv-status-dot" />
        <span>{area === "admin" ? "Vega" : "Luma"} collection</span>
        <span>{catalogItems.length} components</span>
      </div>
    </div>
  );
}
