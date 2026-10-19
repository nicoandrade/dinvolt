"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

import { LoginView } from "@/components/admin/login-view";

const PreviewReadyContext = createContext(false);
export const usePreviewReady = () => useContext(PreviewReadyContext);

export function PreviewEnvironment({
  children,
  scenario,
  dark,
  mockAuth = true,
}: {
  children: ReactNode;
  scenario: string;
  dark: boolean;
  mockAuth?: boolean;
}) {
  const [ready, setReady] = useState(!mockAuth);
  const [error, setError] = useState(false);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    if (!mockAuth) {
      return;
    }
    let active = true;
    const prepare = async () => {
      // A scoped worker also intercepts clients that capture fetch at module
      // initialization. The real /admin and /api routes remain unmodified.
      const registration = await navigator.serviceWorker.register(
        "/preview-worker.js",
        {
          scope: "/preview/",
        }
      );
      const installing = registration.installing ?? registration.waiting;
      if (installing && installing.state !== "activated") {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Preview worker activation timeout")),
            10_000
          );
          installing.addEventListener("statechange", () => {
            if (installing.state === "activated") {
              clearTimeout(timeout);
              resolve();
            }
            if (installing.state === "redundant") {
              clearTimeout(timeout);
              reject(new Error("Preview worker installation failed"));
            }
          });
        });
      }
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            navigator.serviceWorker.removeEventListener(
              "controllerchange",
              controlled
            );
            reject(new Error("Preview worker timeout"));
          }, 10_000);
          function controlled() {
            clearTimeout(timeout);
            resolve();
          }
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            controlled,
            { once: true }
          );
        });
      }
      if (active) {
        setReady(true);
      }
    };
    const start = async () => {
      try {
        await prepare();
      } catch {
        if (active) {
          setError(true);
        }
      }
    };
    void start();
    return () => {
      active = false;
    };
  }, [mockAuth]);
  if (error) {
    return (
      <LoginView>
        <p role="alert">
          Unable to start the preview. Enable service workers and reload this
          page.
        </p>
      </LoginView>
    );
  }
  return (
    <PreviewReadyContext value={ready}>
      <div
        data-preview-ready={ready}
        data-preview-scenario={scenario}
        inert={mockAuth && !ready}
        style={{ display: "contents" }}
      >
        {children}
      </div>
    </PreviewReadyContext>
  );
}
