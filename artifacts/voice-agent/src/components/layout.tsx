import { Link, useLocation } from "wouter";
import { Activity, Users, Phone, Settings, CalendarDays, LogOut, Shield, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearSession } from "@/lib/auth";
import { ChatBox } from "./chat-box";

const NAV_ITEMS = [
  { href: "/admin", label: "Clients", icon: Shield, exact: true },
  { href: "/admin/calls", label: "All Calls", icon: Activity },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-card hidden md:flex flex-col">
        {/* Brand */}
        <div className="h-14 flex items-center px-5 border-b border-border gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <PhoneCall className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight text-foreground">Callvance</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? location === item.href
              : location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors w-full"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="h-14 border-b border-border flex items-center px-5 gap-2.5 md:hidden">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <PhoneCall className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight">Callvance</span>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto p-6">
            {children}
          </div>
        </div>
      </main>

      <ChatBox />
    </div>
  );
}
