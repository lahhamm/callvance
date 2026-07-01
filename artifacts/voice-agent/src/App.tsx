import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import AdminHome from "@/pages/admin/index";
import ClientDetail from "@/pages/admin/client-detail";
import GlobalCallsFeed from "@/pages/admin/calls-feed";
import BookingsFeed from "@/pages/admin/bookings-feed";
import AccessPage from "@/pages/admin/access";
import ClientPortal from "@/pages/client-portal";
import PortalLink from "@/pages/portal-link";
import AgentsLoginPage from "@/pages/agents/login";
import AgentsAdminHome from "@/pages/agents/admin";
import AgentsTenantDashboardPage from "@/pages/agents/tenant-dashboard";
import AgentsPortalPage from "@/pages/agents/portal";
import { useEffect } from "react";
import { isAdminAuthenticated, isClientAuthenticated } from "@/lib/auth";
import { isAgentsAdminAuthenticated, isAgentsTenantAuthenticated } from "@/lib/agents-auth";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AdminGuard({ children }: { children: React.ReactNode }) {
  if (!isAdminAuthenticated()) return <Redirect to="/login" />;
  return <>{children}</>;
}

function ClientGuard({ children }: { children: React.ReactNode }) {
  if (!isClientAuthenticated()) return <Redirect to="/login" />;
  return <>{children}</>;
}

function AdminSection() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <AdminGuard>
      <Layout>
        <Switch>
          <Route path="/admin" component={AdminHome} />
          <Route path="/admin/calls" component={GlobalCallsFeed} />
          <Route path="/admin/bookings" component={BookingsFeed} />
          <Route path="/admin/access" component={AccessPage} />
          <Route path="/admin/clients/:id" component={ClientDetail} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </AdminGuard>
  );
}

function PortalSection() {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    return () => document.documentElement.classList.add("dark");
  }, []);

  return (
    <ClientGuard>
      <ClientPortal />
    </ClientGuard>
  );
}

function RootRedirect() {
  return <Redirect to="/login" />;
}

function AgentsAdminGuard({ children }: { children: React.ReactNode }) {
  if (!isAgentsAdminAuthenticated()) return <Redirect to="/agents/login" />;
  return <>{children}</>;
}

function AgentsTenantGuard({ children }: { children: React.ReactNode }) {
  if (!isAgentsTenantAuthenticated()) return <Redirect to="/agents/login" />;
  return <>{children}</>;
}

// Callvance Agents is a fully independent product: separate login, separate
// localStorage keys (lib/agents-auth.ts), separate API client (lib/agents-api.ts),
// and its own minimal shell (no shared Layout with Receptionist). It always forces
// dark mode while mounted and restores whatever class was present beforehand on
// unmount, so it never fights with AdminSection/PortalSection's own dark-mode effects.
function AgentsSection({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const hadDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.add("dark");
    return () => {
      if (!hadDark) document.documentElement.classList.remove("dark");
    };
  }, []);

  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/login" component={LoginPage} />
            <Route path="/portal" component={PortalSection} />
            <Route path="/admin">{() => <AdminSection />}</Route>
            <Route path="/admin/calls">{() => <AdminSection />}</Route>
            <Route path="/admin/bookings">{() => <AdminSection />}</Route>
            <Route path="/admin/access">{() => <AdminSection />}</Route>
            <Route path="/admin/clients/:id">{() => <AdminSection />}</Route>
            <Route path="/link/:token" component={PortalLink} />

            {/* Callvance Agents — fully independent product (own auth, own API client) */}
            <Route path="/agents/login">{() => <AgentsSection><AgentsLoginPage /></AgentsSection>}</Route>
            <Route path="/agents/admin">
              {() => (
                <AgentsSection>
                  <AgentsAdminGuard>
                    <AgentsAdminHome />
                  </AgentsAdminGuard>
                </AgentsSection>
              )}
            </Route>
            <Route path="/agents/admin/tenants/:id">
              {() => (
                <AgentsSection>
                  <AgentsAdminGuard>
                    <AgentsTenantDashboardPage />
                  </AgentsAdminGuard>
                </AgentsSection>
              )}
            </Route>
            <Route path="/agents/portal">
              {() => (
                <AgentsSection>
                  <AgentsTenantGuard>
                    <AgentsPortalPage />
                  </AgentsTenantGuard>
                </AgentsSection>
              )}
            </Route>

            <Route path="/" component={RootRedirect} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
