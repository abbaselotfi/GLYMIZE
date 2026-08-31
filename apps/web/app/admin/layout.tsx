import AdminAuthGuard from "../components/admin-auth-guard";
import AdminNotificationBell from "../components/admin-notification-bell";
import AdminWorkspaceNav from "./admin-workspace-nav";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AdminAuthGuard>
      <AdminNotificationBell />
      <AdminWorkspaceNav />
      {children}
    </AdminAuthGuard>
  );
}
