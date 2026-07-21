import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Bike, BookOpen, Home, Rocket } from "lucide-react";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bike IoT Control Center" },
      { name: "description", content: "Real-time IoT dashboard for bike telemetry over MQTT." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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

import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

function NavLink({
  to,
  icon: Icon,
  label,
  exact,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: !!exact }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] transition-all",
        "border-white/8 bg-white/[0.02] text-muted-foreground hover:text-foreground hover:border-white/15",
      )}
      activeProps={{
        className:
          "border-[oklch(0.85_0.18_200/0.5)] bg-[oklch(0.85_0.18_200/0.08)] neon-text-cyan",
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen relative">
        <div className="pointer-events-none fixed inset-0 grid-bg opacity-[0.3]" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.85_0.18_200/0.08),transparent_60%)]" />

        <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/40 border-b border-white/5">
          <div className="mx-auto max-w-[1500px] px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
            <Link to="/" className="flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-xl glass-panel grid place-items-center neon-text-cyan">
                <Bike className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[oklch(0.85_0.22_150)] shadow-[0_0_10px_oklch(0.85_0.22_150)] animate-pulse-dot" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-semibold tracking-tight">
                  Bike <span className="neon-text-cyan">IoT</span> Control Center
                </h1>
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  ITS Apaforme · Telemetry v1
                </p>
              </div>
            </Link>
            <nav className="ml-auto flex items-center gap-2 flex-wrap">
              <NavLink to="/" icon={Home} label="Bikes" exact />
              <NavLink to="/firmware" icon={Rocket} label="Firmware" />
              <NavLink to="/docs" icon={BookOpen} label="Docs" />
            </nav>
          </div>
        </header>

        <Outlet />
      </div>
      <Toaster richColors theme="dark" position="top-right" />
    </QueryClientProvider>
  );
}
