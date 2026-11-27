/** Peran bawaan (pengaturan awal revisi poin 1). Superadmin bisa menambah peran lain lewat Role & Hak Akses, jadi id peran berupa string. */
export type BuiltinRoleId = "superadmin" | "planner" | "receiving" | "operator" | "lab" | "qa" | "manager";
export type RoleId = string;
export type Permission =
  | "schedule.edit" | "rules.edit" | "plan.simulate"
  | "arrival.edit" | "queue.record" | "transfer.record" | "lab.record"
  | "production.record" | "equipment.update" | "process.transfer" | "qc.record" | "quality.rules" | "plan.propose"
  | "demand.send" | "plan.decide" | "constraint.edit" | "hold.submit" | "hold.review" | "lab.decide" | "instruction.ack"
  | "users.manage" | "master.manage" | "integration.manage" | "audit.view" | "audit.export";

export interface RoleInfo { label: string; user: string; initials: string; focus: string }
/** Peran tambahan atau perubahan nama/deskripsi peran bawaan, disimpan di state dan dikelola Superadmin. */
export interface CustomRole { id: string; label: string; focus: string }

export const BUILTIN_ROLES: Record<BuiltinRoleId, RoleInfo> = {
  superadmin: { label: "Superadmin", user: "Bagas Wicaksono", initials: "BW", focus: "Mengelola pengguna, peran, master data, dan konfigurasi integrasi. Semua menu dan tindakan terbuka, termasuk riwayat seluruh perubahan dan persetujuan." },
  planner: { label: "PPIC", user: "Rino Akbar Hanif", initials: "RA", focus: "Rencana shift yang layak dan keputusan saat gangguan." },
  receiving: { label: "Receiving Coordinator", user: "Dimas Prasetyo", initials: "DP", focus: "Urutan RT, bay yang siap, dan RT yang mendekati batas holding time." },
  operator: { label: "Production Operator", user: "Hendra Kusuma", initials: "HK", focus: "Target dan realisasi produksi di lini yang ditugaskan, kondisi mesin, dan downtime." },
  qa: { label: "Quality Control", user: "Ratna Maharani", initials: "RM", focus: "Rilis atau tolak susu dari hasil lab, mutu barang jadi, penelusuran batch, dan hold produk." },
  manager: { label: "Supervisor/Manager", user: "Wahyu Pratama", initials: "WP", focus: "Ringkasan pasokan, penggunaan mesin, jadwal, dan pencapaian target, serta simulasi alternatif rencana." },
  lab: { label: "Laboratory", user: "Sri Lestari", initials: "SL", focus: "Sampel RT dan batch proses yang perlu diperiksa, lalu hasil ujinya dimasukkan ke Tes Lab." },
};
export const BUILTIN_IDS = Object.keys(BUILTIN_ROLES) as BuiltinRoleId[];
export const isBuiltin = (id: RoleId): id is BuiltinRoleId => id in BUILTIN_ROLES;
const initialsOf = (label: string) => label.split(/[\s/]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("");

/** Registri peran yang berlaku: bawaan ditambah peran dari state. Diisi ulang oleh state demo lewat setRoles. */
export const ROLES: Record<RoleId, RoleInfo> = { ...BUILTIN_ROLES };
export const ROLE_IDS: RoleId[] = [...BUILTIN_IDS];
export const setRoles = (custom: CustomRole[] | undefined) => {
  for (const k of Object.keys(ROLES)) if (!isBuiltin(k)) delete ROLES[k];
  for (const id of BUILTIN_IDS) ROLES[id] = { ...BUILTIN_ROLES[id] };
  for (const r of custom ?? []) ROLES[r.id] = { ...(ROLES[r.id] ?? { user: "", initials: initialsOf(r.label) }), label: r.label, focus: r.focus };
  ROLE_IDS.splice(0, ROLE_IDS.length, ...Object.keys(ROLES));
};
export type Role = RoleInfo;
export const SUPERADMIN: RoleId = "superadmin";
export const roleLabel = (id: RoleId) => ROLES[id]?.label ?? id;

/** Jenis tindakan yang bisa diatur per menu di Role & Hak Akses. "Lihat" diatur lewat menu yang tampil. */
export type Action = "tambah" | "ubah" | "simulasi" | "setujui" | "ekspor";
export const ACTIONS: { id: Action; label: string }[] = [
  { id: "tambah", label: "Tambah" }, { id: "ubah", label: "Ubah" }, { id: "simulasi", label: "Jalankan simulasi" }, { id: "setujui", label: "Setujui" }, { id: "ekspor", label: "Ekspor" },
];

/**
 * Pengaturan awal izin per peran (poin 1). `page`: menu tempat tindakan ini dipakai; `action`: jenis tindakannya.
 * Superadmin selalu ada di setiap izin; matriks di Role & Hak Akses tidak bisa mencabutnya.
 */
export const PERMISSIONS: Record<Permission, { label: string; short: string; page: string; action: Action | "lihat"; roles: RoleId[] }> = {
  "schedule.edit": { label: "Menambah dan mengubah target serta jadwal produksi", short: "Target dan jadwal", page: "/penjadwalan", action: "ubah", roles: ["superadmin", "planner"] },
  "production.record": { label: "Mencatat produksi mulai, selesai, dan hasil di lini yang ditugaskan", short: "Realisasi produksi", page: "/penjadwalan", action: "tambah", roles: ["superadmin", "operator"] },
  "rules.edit": { label: "Mengatur durasi changeover dan CIP sesuai standar", short: "Changeover dan CIP", page: "/aturan-produksi", action: "ubah", roles: ["superadmin", "planner"] },
  "quality.rules": { label: "Mengatur batas holding time dan ketentuan mutu", short: "Holding dan mutu", page: "/aturan-produksi", action: "ubah", roles: ["superadmin", "qa"] },
  "plan.simulate": { label: "Mengubah parameter simulasi, waktu maintenance, dan kapasitas alat", short: "Simulasi rencana", page: "/rencana/alur", action: "simulasi", roles: ["superadmin", "planner", "manager"] },
  "plan.propose": { label: "Mengajukan hasil simulasi ke Planner untuk diterapkan ke jadwal aktif", short: "Ajukan usulan", page: "/rencana", action: "simulasi", roles: ["superadmin", "manager"] },
  "constraint.edit": { label: "Mengubah batas constraint", short: "Batas constraint", page: "/rencana", action: "ubah", roles: ["superadmin", "planner"] },
  "demand.send": { label: "Mengirim kebutuhan susu ke farm", short: "Kirim kebutuhan susu", page: "/rencana", action: "ubah", roles: ["superadmin", "planner"] },
  "plan.decide": { label: "Menyetujui atau menolak rekomendasi rencana dan usulan simulasi", short: "Keputusan rencana", page: "/rencana", action: "setujui", roles: ["superadmin", "planner"] },
  "arrival.edit": { label: "Menambah dan mengubah jadwal kedatangan RT, estimasi tiba, dan status perjalanan", short: "Jadwal kedatangan", page: "/kedatangan", action: "ubah", roles: ["superadmin", "receiving"] },
  "queue.record": { label: "Mencatat kedatangan aktual, waktu awal umur susu, dan proses bongkar", short: "Tiba dan bongkar", page: "/receiving", action: "tambah", roles: ["superadmin", "receiving"] },
  "transfer.record": { label: "Mencatat transfer susu dari RT ke tangki penerimaan", short: "Transfer RT", page: "/transfer", action: "tambah", roles: ["superadmin", "receiving"] },
  "process.transfer": { label: "Mencatat volume perpindahan bahan pada alat yang ditugaskan", short: "Transfer bahan", page: "/transfer", action: "tambah", roles: ["superadmin", "operator"] },
  "lab.record": { label: "Memasukkan dan memperbarui hasil pemeriksaan lab", short: "Hasil uji", page: "/lab", action: "tambah", roles: ["superadmin", "lab"] },
  "lab.decide": { label: "Merilis atau menolak hasil lab penerimaan RT", short: "Rilis atau tolak RT", page: "/lab", action: "setujui", roles: ["superadmin", "qa"] },
  "qc.record": { label: "Mencatat hasil pemeriksaan mutu barang jadi", short: "Hasil mutu", page: "/qc-produk", action: "tambah", roles: ["superadmin", "qa"] },
  "equipment.update": { label: "Memperbarui kondisi mesin dan mencatat downtime", short: "Kondisi mesin dan downtime", page: "/kondisi-alat", action: "ubah", roles: ["superadmin", "operator"] },
  "instruction.ack": { label: "Mengonfirmasi instruksi dari rencana yang disetujui", short: "Konfirmasi instruksi", page: "/kondisi-alat", action: "setujui", roles: ["superadmin", "receiving", "operator"] },
  "hold.submit": { label: "Mengajukan daftar hold dari hasil trace", short: "Ajukan hold", page: "/hold", action: "tambah", roles: ["superadmin", "qa"] },
  "hold.review": { label: "Menyetujui, menolak, atau melepas hold", short: "Keputusan hold", page: "/hold", action: "setujui", roles: ["superadmin", "qa"] },
  "master.manage": { label: "Mengelola master data", short: "Master data", page: "/master-data", action: "ubah", roles: ["superadmin"] },
  "integration.manage": { label: "Mengelola konfigurasi integrasi sumber data", short: "Konfigurasi integrasi", page: "/sumber-data", action: "ubah", roles: ["superadmin"] },
  "users.manage": { label: "Mengelola pengguna, role, dan hak akses", short: "Pengguna dan role", page: "/pengguna", action: "ubah", roles: ["superadmin"] },
  "audit.view": { label: "Melihat riwayat seluruh perubahan dan persetujuan", short: "Lihat riwayat", page: "/persetujuan", action: "lihat", roles: ["superadmin", "planner", "receiving", "operator", "lab", "qa", "manager"] },
  "audit.export": { label: "Mengekspor riwayat persetujuan ke CSV", short: "Ekspor CSV", page: "/persetujuan", action: "ekspor", roles: ["superadmin", "planner", "receiving", "operator", "lab", "qa", "manager"] },
};
/** Izin yang hanya boleh dipegang Superadmin, supaya tidak ada yang mengunci dirinya keluar dari pengelolaan akses. */
export const LOCKED: Permission[] = ["users.manage"];

export type AccessMap = Partial<Record<Permission, RoleId[]>>;
let access: AccessMap = {};
/** Dipanggil state demo setiap kali Superadmin mengubah hak akses. */
export const setAccess = (next: AccessMap | undefined) => { access = next ?? {}; };
export const rolesFor = (permission: Permission): RoleId[] => {
  const roles = access[permission] ?? PERMISSIONS[permission].roles;
  return roles.includes(SUPERADMIN) ? roles : [SUPERADMIN, ...roles];
};
export const can = (role: RoleId, permission: Permission) => role === SUPERADMIN || rolesFor(permission).includes(role);
/** Kalimat untuk tombol yang dinonaktifkan karena peran. */
export const whoCan = (permission: Permission) => `Hanya ${rolesFor(permission).map(roleLabel).join(" atau ")} yang dapat melakukan ini.`;

/** Pengaturan awal halaman yang disembunyikan per peran (menu dan akses langsung lewat URL). Superadmin melihat semuanya. */
export const HIDDEN_PAGES: Partial<Record<RoleId, string[]>> = {
  planner: ["/qc-produk", "/master-data", "/sumber-data", "/pengguna", "/role-akses"],
  receiving: [
    "/simulasi", "/produksi", "/qc-produk", "/master-data",
    "/penjadwalan", "/aturan-produksi", "/rencana/alur", "/rencana/upgrade", "/rencana",
    "/riwayat-produksi", "/graph", "/hold", "/sumber-data", "/pengguna", "/role-akses",
  ],
  operator: [
    "/kedatangan", "/receiving", "/lab", "/qc-produk", "/master-data",
    "/rencana/alur", "/rencana/upgrade", "/rencana",
    "/riwayat-produksi", "/graph", "/hold", "/sumber-data", "/pengguna", "/role-akses",
  ],
  manager: ["/sumber-data", "/pengguna", "/role-akses"],
  qa: [
    "/simulasi", "/kedatangan", "/receiving", "/produksi", "/kondisi-pabrik", "/kondisi-alat", "/master-data",
    "/penjadwalan", "/rencana/alur", "/rencana/upgrade", "/rencana", "/sumber-data", "/pengguna", "/role-akses",
  ],
  lab: [
    "/simulasi", "/kedatangan", "/transfer", "/produksi", "/kondisi-pabrik", "/kondisi-alat", "/qc-produk", "/master-data",
    "/penjadwalan", "/aturan-produksi", "/rencana/alur", "/rencana/upgrade", "/rencana",
    "/riwayat-produksi", "/graph", "/hold", "/sumber-data", "/pengguna", "/role-akses",
  ],
};
/** Menu yang diatur Superadmin per peran (daftar halaman tersembunyi), menimpa pengaturan awal. */
export type MenuMap = Record<RoleId, string[]>;
let menus: MenuMap = {};
export const setMenus = (next: MenuMap | undefined) => { menus = next ?? {}; };
const currentPage = (href: string) => href === "/alur" ? "/produksi" : href === "/kondisi-alat" ? "/alat" : href;
export const hiddenFor = (role: RoleId): string[] => role === SUPERADMIN ? [] : (menus[role] ?? HIDDEN_PAGES[role] ?? []).map(currentPage);
export const canSee = (role: RoleId, href: string) => !hiddenFor(role).includes(currentPage(href));
/** Riwayat Persetujuan terbuka bagi semua peran yang punya izin audit.view, meski menu induknya (Rencana) disembunyikan. */
export const canOpen = (role: RoleId, pathname: string, tabHref: string) => pathname === "/persetujuan" ? can(role, "audit.view") : canSee(role, tabHref);
