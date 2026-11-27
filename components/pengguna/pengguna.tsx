"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Pencil, UserPlus } from "lucide-react";
import { addUser, setPic, updateUser, useDemo, type DemoUser, PIC_AREAS, type PicArea } from "@/lib/demo";
import { ROLE_IDS, SUPERADMIN, can, roleLabel, type RoleId } from "@/lib/roles";
import { ASSETS, STAGES } from "@/lib/assets";
import { API_MODE, apiSend } from "@/lib/api/client";
import { invalidateResources, useResource } from "@/lib/api/resource";
import type { BeRolesResponse } from "@/lib/api/contract";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle } from "@/components/ui";
import { Select } from "@/components/ui/fields";

interface BeUser {
  id: string;
  name: string;
  email: string;
  role_id: string;
  active: boolean;
  assets: string[];
}

const SUBTITLE = "Kelola akun pengguna dan tetapkan PIC tiap kegiatan. Role dan hak akses tetap diatur di Role & Hak Akses.";

export function Pengguna() {
  const demo = useDemo();
  // Akun dan PIC disimpan di state aplikasi; mode API tetap memakai data akun ini supaya tampilannya
  // sama dengan mode lokal sampai backend menyediakan endpoint pengguna.
  const manage = can(demo.role, "users.manage");

  return (
    <div className="page-enter">
      <PageHeading title="Manajemen akun" subtitle={SUBTITLE}>
        {can(demo.role, "users.manage") && <Link className="button secondary" href="/role-akses">Atur role & hak akses<Icon icon={ArrowRight} size={16} /></Link>}
      </PageHeading>
      <UserList manage={manage} />
      <PicList manage={manage} />
    </div>
  );
}

/** Ringkasan alat yang ditugaskan, mis. "F1, F2, F4 +4". */
const assetsText = (assets?: string[]) => (!assets?.length ? "Tidak dibatasi" : assets.length > 4 ? `${assets.slice(0, 4).join(", ")} +${assets.length - 4}` : assets.join(", "));

function UserList({ manage }: { manage: boolean }) {
  const demo = useDemo();
  const usersRes = useResource<BeUser[]>(API_MODE ? "/users" : null);
  const rolesRes = useResource<BeRolesResponse>(API_MODE ? "/roles" : null);
  const users: DemoUser[] = API_MODE
    ? (usersRes.data ?? []).map(u => ({ id: u.id, name: u.name, role: u.role_id, active: u.active, assets: u.assets?.length ? u.assets : undefined }))
    : demo.users;
  const roleLabelOf = (id: string) => (API_MODE ? rolesRes.data?.roles[id]?.label : undefined) ?? roleLabel(id);
  const availableRoleIds = API_MODE && rolesRes.data ? Object.keys(rolesRes.data.roles) : ROLE_IDS;

  const [name, setName] = useState("");
  const [role, setNewRole] = useState<RoleId>("planner");
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<DemoUser | null>(null);
  const [toggling, setToggling] = useState<DemoUser | null>(null);
  const [roleEdit, setRoleEdit] = useState<DemoUser | null>(null);
  const roleOptions = availableRoleIds.map(id => ({ value: id, label: roleLabelOf(id) }));
  const activeAdmins = users.filter(u => u.role === SUPERADMIN && u.active).length;
  const isLastAdmin = (u: DemoUser) => u.role === SUPERADMIN && u.active && activeAdmins === 1;

  async function savePatch(id: string, patch: { role?: RoleId; active?: boolean; assets?: string[] }) {
    if (!API_MODE) { updateUser(id, patch); return; }
    setSaving(true);
    setApiError(null);
    try {
      await apiSend("PUT", `/users/${encodeURIComponent(id)}`, {
        ...(patch.role !== undefined ? { role_id: patch.role } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.assets !== undefined ? { assets: patch.assets } : {}),
      }, demo.role);
      invalidateResources(["/users", "/audit"]);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Gagal memperbarui pengguna.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!API_MODE) {
      addUser(trimmed, role);
      setName("");
      return;
    }
    setSaving(true);
    setApiError(null);
    try {
      await apiSend("POST", "/users", { name: trimmed, role_id: role, assets: [] }, demo.role);
      invalidateResources(["/users", "/audit"]);
      setName("");
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Gagal menambah pengguna.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="user-list">
      <SectionTitle title="Daftar pengguna" subtitle={API_MODE && usersRes.loading && !usersRes.data ? "Memuat daftar pengguna dari server…" : `${users.filter(u => u.active).length} aktif dari ${users.length} akun`} />
      {(apiError || usersRes.error) && <p className="small crit-text" role="alert">{apiError ?? usersRes.error?.message}</p>}
      <div className="table-wrap">
        <table className="user-table">
          <thead>
            <tr><th>Nama</th><th>Role</th><th>Alat/lini ditugaskan</th><th>Status</th>{manage && <th className="numeric">Aksi</th>}</tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={u.active ? "" : "muted"}>
                <td data-label="Nama"><strong>{u.name}</strong></td>
                <td data-label="Role">
                  {manage && !isLastAdmin(u)
                    ? <span className="user-role"><span>{roleLabelOf(u.role)}</span><button className="icon-button" aria-label={`Ubah role ${u.name}`} onClick={() => setRoleEdit(u)}><Icon icon={Pencil} size={15} /></button></span>
                    : roleLabelOf(u.role)}
                </td>
                <td data-label="Alat/lini">
                  <span className="user-assets">{u.role === SUPERADMIN ? <span className="small muted">Semua alat</span> : <span className="small">{assetsText(u.assets)}</span>}
                    {manage && u.role !== SUPERADMIN && <button className="icon-button" aria-label={`Atur alat dan lini ${u.name}`} onClick={() => setAssigning(u)}><Icon icon={Pencil} size={15} /></button>}
                  </span>
                </td>
                <td data-label="Status"><Badge tone={u.active ? "ok" : "neutral"}>{u.active ? "Aktif" : "Nonaktif"}</Badge></td>
                {manage && (
                  <td data-label="Aksi" className="numeric">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={isLastAdmin(u)}
                      title={isLastAdmin(u) ? "Minimal satu Superadmin harus tetap aktif." : undefined}
                      onClick={() => setToggling(u)}
                    >
                      {u.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {manage && (
        <form className="user-add" onSubmit={submit}>
          <label>
            <span className="field-label">Nama pengguna baru</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: Wulan Pratiwi" autoComplete="off" required maxLength={60} />
          </label>
          <label>
            <span className="field-label">Role</span>
            <Select label="Role pengguna baru" value={role} onChange={setNewRole} options={roleOptions} />
          </label>
          <button type="submit" className="button primary" disabled={!name.trim()}>
            <Icon icon={UserPlus} size={16} />
            Tambah pengguna
          </button>
        </form>
      )}
      {assigning && <AssetDialog user={assigning} onSave={assets => void savePatch(assigning.id, { assets })} onClose={() => setAssigning(null)} />}
      {toggling && <Modal title={toggling.active ? `Nonaktifkan ${toggling.name}?` : `Aktifkan ${toggling.name}?`} onClose={() => setToggling(null)}>
        <p className="dialog-summary">
          {toggling.active
            ? `${toggling.name} tidak bisa masuk dan tidak bisa dipilih sebagai PIC lagi. Riwayat pekerjaannya tetap tersimpan.`
            : `${toggling.name} bisa masuk lagi dengan role ${roleLabelOf(toggling.role)}.`}
        </p>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={() => setToggling(null)} disabled={saving}>Batal</button>
          <button type="button" className="button primary" disabled={saving} onClick={() => { void savePatch(toggling.id, { active: !toggling.active }); setToggling(null); }}>
            {toggling.active ? "Ya, nonaktifkan" : "Ya, aktifkan"}
          </button>
        </div>
      </Modal>}
      {roleEdit && <RoleDialog user={roleEdit} roleOptions={roleOptions} roleLabelOf={roleLabelOf} onSave={nextRole => void savePatch(roleEdit.id, { role: nextRole })} onClose={() => setRoleEdit(null)} />}
    </Card>
  );
}

/** Ubah role akun lewat modal + konfirmasi, bukan pilihan langsung di tabel. */
function RoleDialog({ user, roleOptions, roleLabelOf, onSave, onClose }: { user: DemoUser; roleOptions: { value: string; label: string }[]; roleLabelOf: (id: string) => string; onSave: (role: RoleId) => void; onClose: () => void }) {
  const [role, setRole] = useState<RoleId>(user.role);
  const [confirm, setConfirm] = useState(false);
  return <Modal title={confirm ? "Konfirmasi ubah role" : `Ubah role ${user.name}`} onClose={onClose}>
    {confirm ? <>
      <p className="dialog-summary">Role {user.name} akan diubah dari <strong>{roleLabelOf(user.role)}</strong> menjadi <strong>{roleLabelOf(role)}</strong>. Menu dan tindakan yang bisa diakses ikut berubah.</p>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={() => setConfirm(false)}>Periksa lagi</button>
        <button type="button" className="button primary" onClick={() => { onSave(role); onClose(); }}>Ya, ubah role</button>
      </div>
    </> : <>
      <div className="schedule-form">
        <label><span className="field-label">Role</span><Select label={`Role ${user.name}`} value={role} onChange={setRole} options={roleOptions} /></label>
      </div>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose}>Batal</button>
        <button type="button" className="button primary" disabled={role === user.role} onClick={() => setConfirm(true)}>Simpan</button>
      </div>
    </>}
  </Modal>;
}

/** PIC per kegiatan: akun yang bertanggung jawab, terpisah dari role yang mengatur hak akses. */
function PicList({ manage }: { manage: boolean }) {
  const { users, pics } = useDemo();
  const [area, setArea] = useState<PicArea | null>(null);
  return <Card className="pic-list">
    <SectionTitle title="PIC per kegiatan" subtitle="Akun yang bertanggung jawab pada tiap kegiatan. Boleh lebih dari satu orang per kegiatan." />
    <ul className="pic-rows">
      {PIC_AREAS.map(a => {
        const names = (pics[a.id] ?? []).map(id => users.find(u => u.id === id)?.name).filter((n): n is string => !!n);
        return <li key={a.id} className="pic-row">
          <span className="pic-copy"><strong>{a.label}</strong><span>{a.hint}</span></span>
          <span className="pic-names">{names.length ? names.map(n => <span key={n} className="pic-name">{n}</span>) : <span className="small muted">Belum ditetapkan</span>}</span>
          {manage && <button type="button" className="button secondary" onClick={() => setArea(a.id)}><Icon icon={Pencil} size={15} />Atur</button>}
        </li>;
      })}
    </ul>
    {area && <PicDialog area={area} current={pics[area] ?? []} users={users.filter(u => u.active)} onClose={() => setArea(null)} />}
  </Card>;
}

function PicDialog({ area, current, users, onClose }: { area: PicArea; current: string[]; users: DemoUser[]; onClose: () => void }) {
  const [picked, setPicked] = useState(current);
  const label = PIC_AREAS.find(a => a.id === area)?.label ?? area;
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  return <Modal title={`PIC ${label}`} onClose={onClose} className="lab-entry-modal">
    <form className="schedule-form" onSubmit={e => { e.preventDefault(); setPic(area, picked); onClose(); }}>
      <p className="muted">Pilih akun aktif yang menjadi PIC {label}. Akun nonaktif tidak bisa dipilih.</p>
      <div className="asset-pick">{users.map(u => (
        <label key={u.id} className="check-row"><input type="checkbox" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} /><span>{u.name} <span className="small muted">· {roleLabel(u.role)}</span></span></label>
      ))}</div>
      <div className="dialog-actions">
        <span className="small muted">{picked.length ? `${picked.length} akun dipilih` : "Belum ada akun dipilih"}</span>
        <button type="button" className="button secondary" onClick={() => setPicked([])}>Kosongkan</button>
        <button type="submit" className="button primary">Simpan PIC</button>
      </div>
    </form>
  </Modal>;
}

/** Penugasan alat/lini: membatasi order, mesin, downtime, dan transfer bahan yang bisa dicatat pengguna. */
function AssetDialog({ user, onSave, onClose }: { user: DemoUser; onSave: (assets: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>(user.assets ?? []);
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const stages = [...STAGES].reverse().filter(st => ASSETS.some(a => a.stage === st));

  return (
    <Modal title={`Alat dan lini ${user.name}`} onClose={onClose} className="lab-entry-modal">
      <form className="schedule-form" onSubmit={e => { e.preventDefault(); onSave(picked); onClose(); }}>
        <p className="muted">Pengguna hanya bisa mencatat produksi, kondisi mesin, downtime, dan transfer bahan di alat yang dipilih. Kosongkan bila tidak dibatasi.</p>
        <div className="asset-pick">{stages.map(st => (
          <fieldset key={st}>
            <legend>{st}</legend>
            {ASSETS.filter(a => a.stage === st).map(a => (
              <label key={a.id} className="check-row"><input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} /><span className="mono">{a.id}</span></label>
            ))}
          </fieldset>
        ))}</div>
        <div className="dialog-actions">
          <span className="small muted">{picked.length ? `${picked.length} alat dipilih` : "Tidak dibatasi"}</span>
          <button type="button" className="button secondary" onClick={() => setPicked([])}>Kosongkan</button>
          <button type="submit" className="button primary">Simpan penugasan</button>
        </div>
      </form>
    </Modal>
  );
}
