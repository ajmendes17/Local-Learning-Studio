import { useEffect, useState } from "react";

interface VaultStatus { configured: boolean; vaultPath: string | null; folderPath: string; mode: "local-files" }
interface VaultValidation { courseFolder: string; notesChecked: number; linksChecked: number; issueCount: number; issues: string[]; healthy: boolean }

export function ObsidianExportPanel({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [vaultPath, setVaultPath] = useState("");
  const [folderPath, setFolderPath] = useState("Codex/Local Learning Studio");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadStatus() {
    try {
      const response = await fetch("/api/obsidian/status");
      const next = await response.json() as VaultStatus;
      if (!response.ok) throw new Error("Could not read local Obsidian settings.");
      setStatus(next);
      if (next.vaultPath) setVaultPath(next.vaultPath);
      setFolderPath(next.folderPath);
    } catch { setStatus(null); }
  }

  useEffect(() => { void loadStatus(); }, []);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/obsidian/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vaultPath, folderPath }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save vault settings.");
      setStatus(result); setMessage("Vault folder saved on this computer.");
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function exportNotes() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/courses/${courseId}/obsidian/export`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not export class notes.");
      setMessage(`Updated ${result.notesWritten} notes in ${result.courseFolder}. Your notes outside generated sections were kept.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function validateNotes() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/courses/${courseId}/obsidian/validate`);
      const result = await response.json() as VaultValidation | { error?: string };
      if (!response.ok) throw new Error((result as { error?: string }).error ?? "Could not check class notes.");
      const validation = result as VaultValidation;
      setMessage(validation.healthy
        ? `Checked ${validation.notesChecked} notes and ${validation.linksChecked} class links. Generated sections and internal links look good.`
        : `Checked ${validation.notesChecked} notes and ${validation.linksChecked} class links. ${validation.issueCount} issue${validation.issueCount === 1 ? "" : "s"}: ${validation.issues.slice(0, 2).join(" · ")}`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="obsidian-export" aria-label="Obsidian course notes">
    <div className="obsidian-export__intro"><span className="obsidian-export__mark" aria-hidden="true">◈</span><div><p className="section-kicker">Your notes, connected</p><h2>Keep a copy in Obsidian</h2><p>Export the course map, progress, professor topic lists, and extracted text from imported sources as linked Markdown notes.</p></div><span className={`obsidian-export__status${status?.configured ? " obsidian-export__status--ready" : ""}`}>{status?.configured ? "Vault folder saved" : status ? "Not connected" : "Checking…"}</span></div>
    <form className="obsidian-export__settings" onSubmit={(event) => void saveSettings(event)}>
      <label>Obsidian vault folder on this computer<input value={vaultPath} onChange={(event) => setVaultPath(event.target.value)} placeholder="/Users/you/Documents/Obsidian Vault" required /></label>
      <label>Notes folder inside vault<input value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder="Codex/Local Learning Studio" required /></label>
      <button className="button-secondary" type="submit" disabled={busy || !vaultPath.trim()}>{busy ? "Saving…" : "Save vault folder"}</button>
    </form>
    <div className="obsidian-export__actions"><p>Exports {courseTitle} as editable Markdown files. Source notes keep extracted page, slide, paragraph, or line locations. Re-export refreshes generated sections and keeps your own notes.</p><div><button className="button-secondary" type="button" disabled={busy || !status?.configured} onClick={() => void validateNotes()}>{busy ? "Checking…" : "Check notes"}</button><button className="button-primary" type="button" disabled={busy || !status?.configured} onClick={() => void exportNotes()}>{busy ? "Working…" : "Export this class →"}</button></div></div>
    <p className="obsidian-export__message" role="status">{error || message || (status?.configured ? `Local file export · ${status.folderPath}. Obsidian Sync is managed separately by Obsidian.` : "Enter your vault’s full folder path to connect it. The app writes local Markdown files and does not change Obsidian Sync settings.")}</p>
  </section>;
}
