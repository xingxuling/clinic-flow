import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppStoreProvider } from "@/state/app-store";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-md text-center">
        <h1 className="md-display-s text-on-surface">404</h1>
        <h2 className="mt-4 md-title-l text-on-surface">找不到此頁面</h2>
        <p className="mt-2 md-body-m text-on-surface-variant">
          你要找的頁面不存在，或已被移動。
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="state-layer inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 md-label-l text-primary-foreground"
          >
            返回登入
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-md text-center">
        <h1 className="md-title-l text-on-surface">此頁面未能載入</h1>
        <p className="mt-2 md-body-m text-on-surface-variant">
          系統出現問題，可以嘗試重新載入。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="state-layer inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 md-label-l text-primary-foreground"
          >
            再試一次
          </button>
          <a
            href="/"
            className="state-layer inline-flex h-10 items-center justify-center rounded-full border border-outline px-6 md-label-l text-primary"
          >
            返回登入
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "診所行政 Agent" },
      { name: "description", content: "香港小型診所的邀請制行政後台。" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: "#0f6c73" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "診所行政" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Sans+HK:wght@400;500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-HK">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AppStoreProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="bottom-center" />
      </AppStoreProvider>
    </QueryClientProvider>
  );
}
