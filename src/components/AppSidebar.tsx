import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  BarChart3,
  Briefcase,
  Calculator,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  DollarSign,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Ticket,
  UserCog,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { FEATURE_ACCESS, hasRoleAccess, ROUTE_ACCESS, type UserRole } from "@/lib/permissions";
import { selectRole, useSessionStore } from "@/store/sessionStore";
import { NavLink } from "@/components/NavLink";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: readonly UserRole[];
};

type NavGroup = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const mainItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ROUTE_ACCESS.dashboard },
  { title: "POS", url: "/pos", icon: ShoppingCart, roles: ROUTE_ACCESS.pos },
  { title: "Members", url: "/members", icon: Users, roles: ROUTE_ACCESS.members },
  { title: "Rental Calendar", url: "/rental-calendar", icon: CalendarDays, roles: ROUTE_ACCESS.rentalCalendar },
  { title: "Receipts", url: "/pos/receipts", icon: Receipt, roles: ROUTE_ACCESS.receipts },
  { title: "Products & Inventory", url: "/products", icon: Package, roles: ROUTE_ACCESS.products },
];

const businessGroups: NavGroup[] = [
  {
    title: "Reports",
    icon: BarChart3,
    items: [
      { title: "Daily Cash Collection", url: "/dccr", icon: ClipboardList, roles: ROUTE_ACCESS.dccr },
      { title: "Cash Rcpts & Disb.", url: "/scrd", icon: FileText, roles: ROUTE_ACCESS.scrd },
      { title: "Income Statement", url: "/income-statement", icon: DollarSign, roles: ROUTE_ACCESS.incomeStatement },
    ],
  },
  {
    title: "Accounting",
    icon: Calculator,
    items: [
      { title: "Accounting", url: "/accounting", icon: Calculator, roles: ROUTE_ACCESS.accounting },
      { title: "Disbursement Journal", url: "/cash-disbursement-journal", icon: FileText, roles: ROUTE_ACCESS.cashDisbursementJournal },
      { title: "Receipts Journal", url: "/cash-receipts-journal", icon: FileText, roles: ROUTE_ACCESS.cashReceiptsJournal },
      { title: "Journal Voucher", url: "/journal-voucher", icon: FileText, roles: ROUTE_ACCESS.journalVoucher },
    ],
  },
  {
    title: "HR & Payroll",
    icon: Briefcase,
    items: [
      { title: "Employees", url: "/employees", icon: Users, roles: ROUTE_ACCESS.employees },
      { title: "Payroll", url: "/payroll", icon: DollarSign, roles: ROUTE_ACCESS.payroll },
      { title: "Payroll Sheet", url: "/payroll-sheet", icon: FileText, roles: ROUTE_ACCESS.payrollSheet },
    ],
  },
  {
    title: "Vouchers",
    icon: Ticket,
    items: [
      { title: "Vouchers", url: "/vouchers", icon: FileText, roles: ROUTE_ACCESS.vouchers },
      { title: "Check Voucher", url: "/check-voucher-print", icon: FileText, roles: ROUTE_ACCESS.checkVoucherPrint },
    ],
  },
  {
    title: "Admin",
    icon: Settings,
    items: [
      { title: "Settings", url: "/settings", icon: Settings, roles: ROUTE_ACCESS.settings },
      { title: "User Accounts", url: "/users", icon: UserCog, roles: FEATURE_ACCESS.manageUsers },
      { title: "Audit Log", url: "/audit-log", icon: ClipboardList, roles: ROUTE_ACCESS.auditLogs },
    ],
  },
];

function NavGroupItem({
  group,
  collapsed,
  role,
}: {
  group: NavGroup;
  collapsed: boolean;
  role: ReturnType<typeof selectRole>;
}) {
  const { pathname } = useLocation();

  const visibleItems = group.items.filter(
    (item) => !item.roles || (role && hasRoleAccess(role, item.roles)),
  );
  const isChildActive = visibleItems.some((item) => pathname.startsWith(item.url));
  const [open, setOpen] = useState(isChildActive);

  // Auto-expand when navigating directly to a child route
  useEffect(() => {
    if (isChildActive) setOpen(true);
  }, [isChildActive]);

  if (visibleItems.length === 0) return null;

  if (collapsed) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          className={cn(
            "rounded-[0.7rem] border border-transparent px-3 py-4 text-sidebar-foreground/80 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            isChildActive && "border-white/10 bg-sidebar-accent text-sidebar-foreground font-medium",
          )}
        >
          <group.icon className="h-4 w-4" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            className={cn(
              "rounded-[0.7rem] border border-transparent px-3 py-4 text-sidebar-foreground/80 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              isChildActive && "border-white/10 bg-sidebar-accent text-sidebar-foreground font-medium",
            )}
          >
            <group.icon className="h-4 w-4" />
            <span>{group.title}</span>
            <ChevronDown
              className={cn(
                "ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {visibleItems.map((item) => (
              <SidebarMenuSubItem key={item.title}>
                <NavLink
                  to={item.url}
                  className="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-xs text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </NavLink>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const role = useSessionStore(selectRole);

  const filterByRole = (items: NavItem[]) => {
    if (!role) return items.filter((item) => !item.roles);
    return items.filter((item) => !item.roles || hasRoleAccess(role, item.roles));
  };

  const visibleMain = filterByRole(mainItems);
  const visibleGroups = businessGroups.filter((group) =>
    group.items.some((item) => !item.roles || (role && hasRoleAccess(role, item.roles))),
  );

  return (
    <Sidebar className={collapsed ? "w-14" : "w-[220px]"}>
      <SidebarContent className="border-r border-sidebar-border bg-sidebar px-2 py-3">
        <div className="rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-4">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-[linear-gradient(180deg,#ffe7a4,#ffd96f)]">
                <img src="/favicon.ico" alt="Girl Scout logo" className="h-7 w-7 object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[0.95rem] font-semibold text-sidebar-foreground">Girl Scout Suite</h1>
                <p className="mt-1 text-[0.7rem] text-sidebar-foreground/70">Modern operations workspace</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-[linear-gradient(180deg,#ffe7a4,#ffd96f)]">
              <img src="/favicon.ico" alt="Girl Scout logo" className="h-6 w-6 object-contain" />
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="px-3 pt-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/48">
            Core
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="rounded-[0.7rem] border border-transparent px-3 py-4 text-sidebar-foreground/80 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      activeClassName="border-white/10 bg-sidebar-accent text-sidebar-foreground font-medium"
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

        {visibleGroups.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 pt-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/48">
              Business
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleGroups.map((group) => (
                  <NavGroupItem key={group.title} group={group} collapsed={collapsed} role={role} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
