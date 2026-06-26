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
import ContactsFeed from "@/pages/admin/contacts-feed";
import BookingsFeed from "@/pages/admin/bookings-feed";
import ClientPortal from "@/pages/client-portal";
import { useEffect } from "react";
import { isAdminAuthenticated, isClientAuthenticated } from "@/lib/auth";

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
          <Route path="/admin/contacts" component={ContactsFeed} />
          <Route path="/admin/bookings" component={BookingsFeed} />
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
  if (isAdminAuthenticated()) return <Redirect to="/admin" />;
  if (isClientAuthenticated()) return <Redirect to="/portal" />;
  return <Redirect to="/login" />;
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
            <Route path="/admin/contacts">{() => <AdminSection />}</Route>
            <Route path="/admin/bookings">{() => <AdminSection />}</Route>
            <Route path="/admin/clients/:id">{() => <AdminSection />}</Route>
            <Route path="/" component={RootRedirect} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
