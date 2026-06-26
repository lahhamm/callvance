import { Link, useLocation } from "wouter";
import { Activity, Users, Phone, Settings, Terminal, CalendarDays, LogOut, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearToken } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/admin", label: "Clients", icon: Shield },
  { href: "/admin/calls", label: "Global Feed", icon: Activity },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/calls", label: "Call History", icon: Phone },
  { href: "/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/agent", label: "Agent Config", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();

  const handleLogout = () => {
    clearToken();
    navigate("/login");
  };

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground font-mono">
      <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Terminal className="w-5 h-5 text-primary mr-2" />
          <span className="font-bold text-lg tracking-tight uppercase text-primary">NEXUS_VOICE</span>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors uppercase tracking-wider",
                  isActive
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-l-2 border-transparent"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-muted-foreground/50 hover:text-muted-foreground uppercase tracking-widest transition-colors w-full"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center px-6 md:hidden">
          <Terminal className="w-5 h-5 text-primary mr-2" />
          <span className="font-bold text-lg tracking-tight uppercase text-primary">NEXUS_VOICE</span>
        </header>
        <div className="flex-1 overflow-auto">
          <div className="container mx-auto p-6 max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
