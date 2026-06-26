import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Contacts from "@/pages/contacts";
import Calls from "@/pages/calls";
import AgentConfigPage from "@/pages/agent";
import BookingsPage from "@/pages/bookings";
import LoginPage from "@/pages/login";
import AdminHome from "@/pages/admin/index";
import ClientDetail from "@/pages/admin/client-detail";
import GlobalCallsFeed from "@/pages/admin/calls-feed";
import ClientPortal from "@/pages/client-portal";
import { ChatBox } from "@/components/chat-box";
import { useEffect } from "react";
import { isAuthenticated } from "@/lib/auth";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  if (!isAuthenticated()) {
    return <Redirect to="/login" />;
  }
  return <>{children}</>;
}

function AdminRouter() {
  return (
    <ProtectedRoute>
      <Layout>
        <Switch>
          <Route path="/admin" component={AdminHome} />
          <Route path="/admin/calls" component={GlobalCallsFeed} />
          <Route path="/admin/clients/:id" component={ClientDetail} />
          <Route path="/contacts" component={Contacts} />
          <Route path="/calls" component={Calls} />
          <Route path="/bookings" component={BookingsPage} />
          <Route path="/agent" component={AgentConfigPage} />
          <Route path="/">{() => <Redirect to="/admin" />}</Route>
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </ProtectedRoute>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/login" component={LoginPage} />
            <Route path="/client/:token">{(params) => <ClientPortalWrapper token={params.token} />}</Route>
            <Route>{() => <AdminRouter />}</Route>
          </Switch>
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function ClientPortalWrapper({ token }: { token: string }) {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    return () => document.documentElement.classList.add("dark");
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ClientPortal />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
