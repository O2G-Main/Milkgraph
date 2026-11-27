import { canSee, type RoleId } from "@/lib/roles";
import {
  LayoutDashboard, Box, Factory, CalendarClock, GitBranch, Settings,
  Truck, ListOrdered, Workflow, Gauge, TestTubeDiagonal, Layers3,
  History, Share2, FlaskConical, PackageX, Database, Library, Users, TrendingUp, Waypoints, ClipboardCheck, CalendarRange, Timer, CalendarDays, ArrowRightLeft, ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/** `match`: halaman detail tanpa menu sendiri yang tetap menyorot tab ini (mis. /tangki di bawah Kondisi Alat). */
export type NavTab = { label: string; href: string; icon?: LucideIcon; match?: string[] };
export type NavItem = { label: string; hint: string; icon: LucideIcon; tabs: NavTab[] };

/** Delapan menu utama, sub-menu hanya untuk halaman inti. Menu dengan lebih dari satu tab tampil sebagai sub-menu bercabang di sidebar; URL tiap tab tetap sama seperti sebelumnya. */
export const navigation: NavItem[] = [
  { label: "Beranda", hint: "Ringkasan semua area", icon: LayoutDashboard, tabs: [{ label: "Beranda", href: "/" }] },
  { label: "Simulasi 3D", hint: "Plant dan bottleneck", icon: Box, tabs: [{ label: "Simulasi 3D", href: "/simulasi" }] },
  { label: "Penerimaan", hint: "Kedatangan, antrean, lab", icon: Truck, tabs: [{ label: "Jadwal Kedatangan RT", href: "/kedatangan", icon: CalendarDays }, { label: "Antrean Truk", href: "/receiving", icon: ListOrdered }, { label: "Tes Lab", href: "/lab", icon: FlaskConical }] },
  { label: "Operasional", hint: "Jadwal, kondisi pabrik, dan mutu", icon: Factory, tabs: [{ label: "Penjadwalan", href: "/penjadwalan", icon: CalendarRange }, { label: "Kondisi Pabrik", href: "/kondisi-pabrik", icon: Gauge }, { label: "QC Barang Jadi", href: "/qc-produk", icon: TestTubeDiagonal }] },
  { label: "Master", hint: "Produksi, alat, dan produk", icon: Layers3, tabs: [{ label: "Produksi", href: "/produksi", icon: Workflow }, { label: "Alat", href: "/alat", icon: Gauge, match: ["/kondisi-alat", "/tangki", "/filling"] }, { label: "Master Produk", href: "/produk", icon: Library, match: ["/master-data"] }] },
  { label: "Rencana", hint: "Aturan dan keputusan", icon: CalendarClock, tabs: [{ label: "Aturan Produksi", href: "/aturan-produksi", icon: Timer }, { label: "Alur rencana", href: "/rencana/alur", icon: Waypoints }, { label: "Rekomendasi upgrade", href: "/rencana/upgrade", icon: TrendingUp }, { label: "Kelayakan & keputusan", href: "/rencana", icon: ClipboardCheck, match: ["/pasokan", "/constraint", "/persetujuan"] }] },
  { label: "Traceability", hint: "Asal produksi dan volume", icon: GitBranch, tabs: [{ label: "Riwayat Produksi", href: "/riwayat-produksi", icon: History, match: ["/trace"] }, { label: "Context Graph", href: "/graph", icon: Share2 }, { label: "Hold Produk", href: "/hold", icon: PackageX }, { label: "Transfer & Volume", href: "/transfer", icon: ArrowRightLeft }] },
  { label: "Pengaturan", hint: "Sumber data, akun, role", icon: Settings, tabs: [{ label: "Sumber Data", href: "/sumber-data", icon: Database }, { label: "Manajemen akun", href: "/pengguna", icon: Users }, { label: "Role & Hak Akses", href: "/role-akses", icon: ShieldCheck }] },
];

/** Menu yang boleh dilihat peran ini; menu induk tanpa tab tersisa ikut hilang. */
export const visibleNav = (role: RoleId) => navigation
  // Supervisor/Manager membuka Beranda sebagai Executive Dashboard.
  .map(item => (role === "manager" && item.label === "Beranda" ? { ...item, label: "Executive Dashboard", hint: "Pasokan, mesin, jadwal, target", tabs: [{ ...item.tabs[0], label: "Executive Dashboard" }] } : item))
  .map(item => ({ ...item, tabs: item.tabs.filter(t => canSee(role, t.href)) }))
  .filter(item => item.tabs.length > 0);

/** Menu dan tab yang cocok dengan path; jatuh ke Beranda bila tidak ada. */
export function findNav(pathname: string) {
  for (const item of navigation) {
    const tab = item.tabs.find(t => t.href === pathname || t.match?.includes(pathname));
    if (tab) return { item, tab };
  }
  return { item: navigation[0], tab: navigation[0].tabs[0] };
}

/** Halaman detail tanpa menu sendiri: selalu punya tombol Kembali (lihat AppShell). */
const DETAIL_TITLES: Record<string, string> = {
  "/tangki": "Bay & Tangki", "/filling": "Lini Filling", "/pasokan": "Pasokan & Permintaan",
  "/constraint": "Constraint", "/persetujuan": "Riwayat Persetujuan", "/trace": "Traceability",
};
export const isDetail = (path: string) => path in DETAIL_TITLES;
export const pageTitle = (path: string) => DETAIL_TITLES[path] ?? findNav(path).tab.label;
