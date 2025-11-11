import {
  LayoutDashboard,
  ShoppingCart,
  Calculator,
  Users,
  DollarSign,
  FileText,
  Package,
  Settings,
  Receipt,
  ClipboardList,
  CalendarDays,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useSessionStore, selectRole } from "@/store/sessionStore";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Array<"admin" | "cashier" | "accountant" | "hr" | "inventory_clerk" | "manager">;
};

const mainItems: NavItem[] = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    roles: ["admin", "accountant"],
  },
  { title: "POS", url: "/pos", icon: ShoppingCart, roles: ["admin", "cashier"] },
  { title: "Rental Calendar", url: "/rental-calendar", icon: CalendarDays, roles: ["admin", "cashier"] },
  { title: "Receipts", url: "/pos/receipts", icon: Receipt, roles: ["admin", "cashier"] },
  { title: "Receipt Settings", url: "/cashier/receipt-settings", icon: Receipt, roles: ["admin", "cashier"] },
  { title: "Products", url: "/products", icon: Package, roles: ["admin", "cashier", "inventory_clerk"] },
];

const businessItems: NavItem[] = [
  { title: "Daily Cash Collection Report", url: "/dccr", icon: ClipboardList, roles: ["admin", "cashier", "accountant"] },
  { title: "Inventory Report", url: "/inventory-report", icon: Package, roles: ["admin", "cashier", "accountant", "inventory_clerk"] },
  { title: "Income Statement", url: "/income-statement", icon: DollarSign, roles: ["admin", "cashier", "accountant"] },
  { title: "Accounting", url: "/accounting", icon: Calculator, roles: ["admin", "accountant"] },
  { title: "Employees", url: "/employees", icon: Users, roles: ["admin", "hr"] },
  { title: "Payroll", url: "/payroll", icon: DollarSign, roles: ["admin", "accountant"] },
  { title: "Vouchers", url: "/vouchers", icon: FileText, roles: ["admin", "accountant", "manager"] },
  { title: "Settings", url: "/settings", icon: Settings, roles: ["admin", "manager"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const collapsed = state === "collapsed";
  const role = useSessionStore(selectRole);

  const isActive = (path: string) => {
    const [basePath] = path.split("#");
    if (basePath === "/") return location.pathname === "/";
    return location.pathname.startsWith(basePath);
  };

  const filterByRole = (items: NavItem[]) => {
    if (!role) {
      return items.filter((item) => !item.roles);
    }
    return items.filter((item) => !item.roles || item.roles.includes(role));
  };

  const visibleMain = filterByRole(mainItems);
  const visibleBusiness = filterByRole(businessItems);

  return (
    <Sidebar className={collapsed ? "w-14" : "w-64"}>
      <SidebarContent>
        {/* Logo/Brand */}
        <div className="p-4 border-b border-sidebar-border">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                <span className="text-primary font-bold text-sm">GS</span>
              </div>
              <div>
                <h1 className="font-bold text-sidebar-foreground text-sm">Girl Scout</h1>
                <p className="text-xs text-sidebar-foreground/70">Business Suite</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center mx-auto">
              <span className="text-primary font-bold text-sm">GS</span>
            </div>
          )}
        </div>

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
                {visibleMain.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Business Modules */}
        <SidebarGroup>
          <SidebarGroupLabel>Business</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
                {visibleBusiness.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
