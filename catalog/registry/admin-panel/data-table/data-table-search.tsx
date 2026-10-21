"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import Search from "@/components/icons/outline/search";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const normalize = (value: string) => value.trim().slice(0, 100);

const DataTableSearch = ({
  value,
  onCommit,
  label = "Search",
  placeholder = "Search…",
  debounceMs = 450,
}: {
  value: string;
  onCommit: (value: string) => void;
  label?: string;
  placeholder?: string;
  debounceMs?: number;
}) => {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownCommit = useRef<string | null>(null);
  const composing = useRef(false);
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = null;
  }, []);

  useEffect(() => {
    if (ownCommit.current === value) {
      ownCommit.current = null;
      return;
    }
    cancel();
    ownCommit.current = null;
    setDraft(value);
  }, [value, cancel]);

  useEffect(() => {
    const onPopState = () => {
      cancel();
      ownCommit.current = null;
      setDraft(
        normalize(
          new URLSearchParams(window.location.search).get("search") ?? ""
        )
      );
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      cancel();
      window.removeEventListener("popstate", onPopState);
    };
  }, [cancel]);

  const commit = (next: string) => {
    cancel();
    ownCommit.current = next;
    onCommit(next);
  };
  const change = (raw: string) => {
    const nextDraft = raw.slice(0, 100);
    setDraft(nextDraft);
    cancel();
    if (composing.current) {
      return;
    }
    const next = normalize(nextDraft);
    if (next === value) {
      return;
    }
    if (next) {
      timer.current = setTimeout(() => commit(next), debounceMs);
    } else {
      commit("");
    }
  };

  return (
    <search className="w-full min-w-0 sm:max-w-xs">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!composing.current) {
            commit(normalize(draft));
          }
        }}
      >
        {/* eslint-disable shadcn/no-restyle -- Keep the compact search compatible with presets whose InputGroup has no size prop. */}
        <InputGroup
          className="h-8 [--input-group-height:2rem] [--input-group-icon-size:0.875rem] [&>[data-slot=input-group-addon]]:md:text-xs"
          data-size="sm"
        >
          <InputGroupInput
            aria-label={label}
            className="[&::-webkit-search-cancel-button]:appearance-none"
            maxLength={100}
            name="search"
            onChange={(event) => change(event.target.value)}
            onCompositionStart={() => {
              composing.current = true;
              cancel();
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              change(event.currentTarget.value);
            }}
            placeholder={placeholder}
            type="search"
            value={draft}
          />
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          {draft ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Clear search"
                onClick={() => {
                  setDraft("");
                  commit("");
                }}
                size="icon-xs"
                type="button"
              >
                <X aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        {/* eslint-enable shadcn/no-restyle */}
      </form>
    </search>
  );
};

export { DataTableSearch };
