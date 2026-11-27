"use client";

import { useState, type FormEvent } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { apiSend } from "@/lib/api/client";
import { invalidateResources, useResource } from "@/lib/api/resource";
import type { BePermission, BeRolesResponse } from "@/lib/api/contract";
import { useDemo } from "@/lib/demo";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle } from "@/components/ui";

/**
 * Role & Hak Akses mode API: membaca & mengelola registri role langsung ke Backend
 * (GET/POST /roles, PUT/DELETE /roles/{id}, GET /permissions).
 */
export function RoleAksesApi() {
  const demo = useDemo();
  const rolesRes = useResource<BeRolesResponse>("/roles");
  const permsRes = useResource<BePermission[]>("/permissions");
  const [selected, setSelected] = useState<string>("planner");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newFocus, setNewFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = rolesRes.data;
  if (!data) {
    return <div className="page-enter">
      <PageHeading title="Role & Hak Akses" subtitle="Registri role dan permission dari Backend." />
      {rolesRes.error
        ? <p className="crit-text" role="alert">Gagal memuat registri role: {rolesRes.error.message}</p>
        : <p className="muted" role="status">Memuat registri role…</p>}
    </div>;
  }

  const roles = data.roles;
  const ids = Object.keys(roles);
  const active = roles[selected] ? selected : ids[0];
  const role = roles[active];
  const catalog = new Map((permsRes.data ?? []).map(p => [p.name, p.label]));
  const labelOf = (name: string) => catalog.get(name) ?? data.permissions[name]?.label ?? name;
  const held = new Set(role?.permissions ?? []);
  const isSuperadmin = demo.role === "superadmin";

  async function createRole(e: FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{ role_id: string }>("POST", "/roles", { nama: newLabel.trim(), deskripsi: newFocus.trim(), permissions: [] }, demo.role);
      invalidateResources(["/roles", "/audit"]);
      if (res?.role_id) setSelected(res.role_id);
      setNewLabel("");
      setNewFocus("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat role.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePermission(perm: string) {
    if (!role || active === "superadmin") return;
    setBusy(true);
    setError(null);
    const next = held.has(perm) ? [...held].filter(p => p !== perm) : [...held, perm];
    try {
      await apiSend("PUT", `/roles/${encodeURIComponent(active)}`, { nama: role.label, deskripsi: role.focus, permissions: next }, demo.role);
      invalidateResources(["/roles", "/audit"]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui permission.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole() {
    if (!role || role.builtin) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend("DELETE", `/roles/${encodeURIComponent(active)}`, {}, demo.role);
      invalidateResources(["/roles", "/audit"]);
      setSelected("planner");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus role.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-enter">
      <PageHeading title="Role & Hak Akses" subtitle="Sumber kebenaran role dan permission adalah PostgreSQL Backend. Perubahan langsung tersimpan ke server.">
        {isSuperadmin && <button type="button" className="button primary" onClick={() => { setError(null); setAdding(true); }}><Icon icon={Plus} size={16} />Tambah role</button>}
      </PageHeading>
      {error && <p className="small crit-text" role="alert">{error}</p>}
      <div className="role-layout">
        <Card className="role-list-card">
          <SectionTitle title="Role" subtitle={`${ids.length} role terdaftar di server`} />
          <ul className="role-pick">{ids.map(id => (
            <li key={id}><button type="button" aria-pressed={id === active} className={id === active ? "selected" : ""} onClick={() => setSelected(id)}>
              <span><strong>{roles[id].label}</strong><span>{roles[id].user}</span></span>
              <Badge tone={roles[id].builtin ? "neutral" : "ok"}>{roles[id].builtin ? "Bawaan" : "Kustom"}</Badge>
            </button></li>
          ))}</ul>
        </Card>
        <Card className="role-detail">
          <SectionTitle title={role?.label ?? active} subtitle={role?.focus || "Belum ada deskripsi dari server."}
            action={isSuperadmin && !role?.builtin ? <button type="button" className="button secondary" disabled={busy} onClick={() => void deleteRole()}><Icon icon={Trash2} size={15} />Hapus role</button> : undefined} />
          <p className="small muted">Persona sesi: {role?.user} ({role?.initials}). Id role: <span className="mono">{active}</span>.</p>
          <h3 className="small"><strong>Permission role ini ({held.size} dari {catalog.size || held.size})</strong></h3>
          <div className="perm-chips">
            {[...held].sort().map(name => <span key={name} className="perm-chip on" title={name}><Icon icon={Check} size={13} />{labelOf(name)}</span>)}
            {!held.size && <span className="small muted">Tidak ada permission tercatat untuk role ini.</span>}
          </div>
          <h3 className="small"><strong>Katalog permission Backend</strong></h3>
          <div className="table-wrap"><table className="access-table">
            <thead><tr><th>Permission</th><th>Label</th><th>Status</th></tr></thead>
            <tbody>{(permsRes.data ?? []).map(p => <tr key={p.name}>
              <td><span className="mono">{p.name}</span></td>
              <td>{p.label}</td>
              <td>{isSuperadmin && active !== "superadmin"
                ? <button type="button" className={`button ${held.has(p.name) ? "primary" : "secondary"}`} disabled={busy} onClick={() => void togglePermission(p.name)}>{held.has(p.name) ? "Aktif" : "Aktifkan"}</button>
                : held.has(p.name) ? <Badge tone="ok">Ya</Badge> : <span className="small muted">Tidak</span>}</td>
            </tr>)}
            {!permsRes.data && <tr><td colSpan={3} className="muted">{permsRes.error ? `Katalog permission gagal dimuat: ${permsRes.error.message}` : "Memuat katalog permission…"}</td></tr>}
            </tbody>
          </table></div>
        </Card>
      </div>
      {adding && <Modal title="Tambah role baru" onClose={() => setAdding(false)}>
        <form className="schedule-form" onSubmit={createRole}>
          <label><span className="field-label">Nama role</span><input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Contoh: Kepala Gudang" required maxLength={40} /></label>
          <label><span className="field-label">Deskripsi fokus</span><input value={newFocus} onChange={e => setNewFocus(e.target.value)} placeholder="Contoh: Mengelola stok barang jadi dan hold" maxLength={160} /></label>
          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={() => setAdding(false)} disabled={busy}>Batal</button>
            <button type="submit" className="button primary" disabled={busy || !newLabel.trim()}>{busy ? "Menyimpan…" : "Simpan role"}</button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}
