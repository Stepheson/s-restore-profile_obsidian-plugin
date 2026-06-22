import { Plugin, Modal, Notice, requestUrl, normalizePath, App, Vault, addIcon } from "obsidian";

const PLUGINS_INDEX_URL =
  "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json";
const THEMES_INDEX_URL =
  "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-css-themes.json";

interface PluginIndexEntry {
  id?: string;
  name: string;
  description?: string;
  author: string;
  repo: string;
}

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  assets: GithubReleaseAsset[];
}

interface ProfilePluginEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  repo?: string;
}

interface ProfileThemeEntry {
  name: string;
  version: string;
  author: string;
  active: boolean;
  repo?: string;
}

interface ProfileData {
  plugins: ProfilePluginEntry[];
  themes: ProfileThemeEntry[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchIndex(type: "plugins" | "themes"): Promise<PluginIndexEntry[]> {
  const url = type === "plugins" ? PLUGINS_INDEX_URL : THEMES_INDEX_URL;
  const res = await requestUrl({ url });
  return res.json;
}

async function getLatestTagInfo(repo: string): Promise<{ tag: string; branch: string } | null> {
  for (const branch of ["master", "main"]) {
    try {
      const res = await requestUrl({
        url: `https://raw.githubusercontent.com/${repo}/${branch}/manifest.json`,
        throw: false,
      });
      if (res.status === 200) {
        return { tag: res.json.version ?? null, branch };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchFileBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await requestUrl({ url, throw: false });
    if (res.status === 200) return res.arrayBuffer;
    return null;
  } catch {
    return null;
  }
}

async function installItem(
  type: "plugins" | "themes",
  idOrName: string,
  repo: string,
  vault: Vault,
  logFn: (msg: string) => void
): Promise<{ success: boolean; method?: string }> {
  const dir = normalizePath(`.obsidian/${type}/${idOrName}`);

  const saveToDisk = async (buffers: Record<string, ArrayBuffer>) => {
    const dirExists = await vault.adapter.exists(dir);
    if (!dirExists) await vault.createFolder(dir);
    for (const [filename, buffer] of Object.entries(buffers)) {
      await vault.adapter.writeBinary(normalizePath(`${dir}/${filename}`), buffer);
    }
  };

  logFn(`  Fetching latest version...`);
  const tagInfo = await getLatestTagInfo(repo);
  const tag = tagInfo?.tag;
  const branch = tagInfo?.branch;

  if (tag) {
    logFn(`  Version: ${tag}`);
    const base = `https://github.com/${repo}/releases/download/${tag}`;
    let ok = true;
    const buffers: Record<string, ArrayBuffer> = {};

    const filesToDownload = type === "plugins"
      ? ["main.js", "manifest.json"]
      : ["theme.css", "manifest.json"];

    for (const file of filesToDownload) {
      logFn(`  Downloading ${file}...`);
      const buf = await fetchFileBuffer(`${base}/${file}`);
      if (!buf) {
        logFn(`  ✗ Failed: ${file}`);
        ok = false;
        break;
      } else {
        buffers[file] = buf;
        logFn(`  ✓ ${file}`);
      }
    }

    if (ok) {
      if (type === "plugins") {
        const stylesBuf = await fetchFileBuffer(`${base}/styles.css`);
        if (stylesBuf) buffers["styles.css"] = stylesBuf;
      }
      await saveToDisk(buffers);
      return { success: true, method: "direct" };
    }
  }

  logFn(`  Trying via GitHub API...`);
  try {
    const res = await requestUrl({
      url: `https://api.github.com/repos/${repo}/releases`,
      throw: false,
    });
    if (res.status !== 200) throw new Error("API unavailable");

    const releases: GithubRelease[] = res.json;
    if (!Array.isArray(releases) || !releases.length)
      throw new Error("No releases found");

    const requiredAssets = type === "plugins" ? ["main.js", "manifest.json"] : ["theme.css", "manifest.json"];
    const allAssets = type === "plugins" ? ["main.js", "manifest.json", "styles.css"] : requiredAssets;

    const assets = releases[0].assets.filter((a: GithubReleaseAsset) =>
      allAssets.includes(a.name)
    );

    let ok = true;
    const buffers: Record<string, ArrayBuffer> = {};
    for (const asset of assets) {
      logFn(`  Downloading ${asset.name} (API)...`);
      const buf = await fetchFileBuffer(asset.browser_download_url);
      if (!buf && requiredAssets.includes(asset.name)) {
        logFn(`  ✗ Failed: ${asset.name}`);
        ok = false;
        break;
      } else if (buf) {
        buffers[asset.name] = buf;
        logFn(`  ✓ ${asset.name}`);
      }
    }

    if (ok && requiredAssets.every(ra => assets.some((a: GithubReleaseAsset) => a.name === ra && buffers[ra]))) {
      await saveToDisk(buffers);
      return { success: true, method: "api" };
    }
  } catch (e: unknown) {
    logFn(`  ✗ API: ${(e as Error).message}`);
  }

  if (branch) {
    logFn(`  Trying raw files from ${branch} branch...`);
    const rawBase = `https://raw.githubusercontent.com/${repo}/${branch}`;
    let rawOk = true;
    const buffers: Record<string, ArrayBuffer> = {};

    const filesToDownload = type === "plugins"
      ? ["main.js", "manifest.json"]
      : ["theme.css", "manifest.json"];

    for (const file of filesToDownload) {
      logFn(`  Downloading ${file} (raw)...`);
      const buf = await fetchFileBuffer(`${rawBase}/${file}`);
      if (!buf) {
        logFn(`  ✗ Failed: ${file}`);
        rawOk = false;
        break;
      } else {
        buffers[file] = buf;
        logFn(`  ✓ ${file}`);
      }
    }

    if (rawOk) {
      if (type === "plugins") {
        const stylesBuf = await fetchFileBuffer(`${rawBase}/styles.css`);
        if (stylesBuf) buffers["styles.css"] = stylesBuf;
      }
      await saveToDisk(buffers);
      return { success: true, method: "raw" };
    }
  }

  return { success: false };
}

// ── Modals ───────────────────────────────────────────────────────────────────

class ConfirmModal extends Modal {
  message: string;
  onConfirm: () => void;

  constructor(app: App, message: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Confirm Action" });
    contentEl.createEl("p", { text: this.message });

    const footer = contentEl.createDiv({ cls: "s-restore-profile-footer" });
    footer.style.marginTop = "20px";

    const btnConfirm = footer.createEl("button", {
      text: "Yes",
      cls: "mod-cta s-restore-profile-btn-danger",
    });
    btnConfirm.onclick = () => {
      this.onConfirm();
      this.close();
    };

    const btnCancel = footer.createEl("button", { text: "Cancel" });
    btnCancel.onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ReinstallerModal extends Modal {
  profilePlugins: ProfilePluginEntry[];
  profileThemes: ProfileThemeEntry[];
  checkedPlugins: Record<string, boolean>;
  checkedThemes: Record<string, boolean>;
  currentTab: "plugins" | "themes";
  installing: boolean;
  log: string[];
  logEl!: HTMLElement;
  btnConfirm!: HTMLButtonElement;
  btnUninstall!: HTMLButtonElement;
  selectedCountLabel!: HTMLElement;
  pluginIndex: PluginIndexEntry[] | null = null;
  themeIndex: PluginIndexEntry[] | null = null;

  constructor(app: App) {
    super(app);
    this.profilePlugins = [];
    this.profileThemes = [];
    this.checkedPlugins = {};
    this.checkedThemes = {};
    this.currentTab = "plugins";
    this.installing = false;
    this.log = [];
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("s-restore-profile-modal");
    this.modalEl.addClass("s-restore-profile-window");

    contentEl.createEl("h2", { text: "S-Restore Profile" });

    let activePlugins: string[] = [];
    try {
      const raw = await this.app.vault.adapter.read(
        normalizePath(".obsidian/community-plugins.json")
      );
      activePlugins = JSON.parse(raw);
    } catch {
      // It's ok if community-plugins.json doesn't exist
    }

    let activeTheme = "";
    try {
      const raw = await this.app.vault.adapter.read(
        normalizePath(".obsidian/appearance.json")
      );
      activeTheme = JSON.parse(raw).cssTheme || "";
    } catch {
      // ignore
    }

    try {
      const pluginDirList = await this.app.vault.adapter.list(normalizePath(".obsidian/plugins"));
      for (const folder of pluginDirList.folders) {
        try {
          const manifestRaw = await this.app.vault.adapter.read(`${folder}/manifest.json`);
          const manifest = JSON.parse(manifestRaw);
          if (manifest.id === "s-restore-profile") continue; // skip ourselves

          this.profilePlugins.push({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            enabled: activePlugins.includes(manifest.id),
          });
        } catch {
          // ignore folders without valid manifest
        }
      }
    } catch {
      // .obsidian/plugins might not exist
    }

    try {
      const themeDirList = await this.app.vault.adapter.list(normalizePath(".obsidian/themes"));
      for (const folder of themeDirList.folders) {
        try {
          const manifestRaw = await this.app.vault.adapter.read(`${folder}/manifest.json`);
          const manifest = JSON.parse(manifestRaw);
          this.profileThemes.push({
            name: manifest.name,
            version: manifest.version,
            author: manifest.author,
            active: activeTheme === manifest.name,
          });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    // Initialize all as checked, unless already installed
    for (const p of this.profilePlugins) {
      const isInstalled = await this.app.vault.adapter.exists(normalizePath(`.obsidian/plugins/${p.id}/main.js`));
      this.checkedPlugins[p.id] = !isInstalled;
    }
    for (const t of this.profileThemes) {
      const isInstalled = await this.app.vault.adapter.exists(normalizePath(`.obsidian/themes/${t.name}/theme.css`));
      this.checkedThemes[t.name] = !isInstalled;
    }

    this.renderList(contentEl);
  }

  renderList(contentEl: HTMLElement) {
    // Tabs
    const tabsContainer = contentEl.createDiv({ cls: "s-restore-profile-tabs" });
    tabsContainer.style.display = "flex";
    tabsContainer.style.gap = "10px";
    tabsContainer.style.marginBottom = "10px";
    tabsContainer.style.borderBottom = "1px solid var(--background-modifier-border)";

    const btnTabPlugins = tabsContainer.createEl("button", { text: "Plugins" });
    const btnTabThemes = tabsContainer.createEl("button", { text: "Themes" });

    btnTabPlugins.style.background = this.currentTab === "plugins" ? "var(--interactive-accent)" : "transparent";
    btnTabPlugins.style.borderBottom = "none";
    btnTabThemes.style.background = this.currentTab === "themes" ? "var(--interactive-accent)" : "transparent";
    btnTabThemes.style.borderBottom = "none";

    btnTabPlugins.onclick = () => { this.currentTab = "plugins"; this.refreshUI(); };
    btnTabThemes.onclick = () => { this.currentTab = "themes"; this.refreshUI(); };

    const isPlugins = this.currentTab === "plugins";
    const currentList = isPlugins ? this.profilePlugins : this.profileThemes;
    const currentChecked = isPlugins ? this.checkedPlugins : this.checkedThemes;

    // Subtitle
    const sub = contentEl.createEl("p", { cls: "s-restore-profile-sub" });
    sub.setText(`${currentList.length} ${isPlugins ? "plugin(s)" : "theme(s)"} found in current list:`);

    // Quick actions
    const actions = contentEl.createDiv({ cls: "s-restore-profile-actions" });
    actions.style.display = "flex";
    actions.style.justifyContent = "space-between";

    const leftActions = actions.createDiv({ cls: "s-restore-profile-actions-left" });
    leftActions.style.display = "flex";
    leftActions.style.gap = "8px";

    const btnAll = leftActions.createEl("button", { text: `Select all` });
    btnAll.onclick = () => {
      currentList.forEach((item) => {
        const idOrName = isPlugins ? (item as ProfilePluginEntry).id : (item as ProfileThemeEntry).name;
        currentChecked[idOrName] = true;
        const cb = contentEl.querySelector(`[data-id="${idOrName}"]`) as HTMLInputElement;
        if (cb) cb.checked = true;
      });
      this.updateSelectionCount();
    };

    const btnNone = leftActions.createEl("button", { text: `Deselect all` });
    btnNone.onclick = () => {
      currentList.forEach((item) => {
        const idOrName = isPlugins ? (item as ProfilePluginEntry).id : (item as ProfileThemeEntry).name;
        currentChecked[idOrName] = false;
        const cb = contentEl.querySelector(`[data-id="${idOrName}"]`) as HTMLInputElement;
        if (cb) cb.checked = false;
      });
      this.updateSelectionCount();
    };

    const rightActions = actions.createDiv({ cls: "s-restore-profile-actions-right" });
    rightActions.style.display = "flex";
    rightActions.style.gap = "8px";

    const btnGenerate = rightActions.createEl("button", { text: "Generate Profile Data" });
    btnGenerate.onclick = () => this.generateProfileData();

    const btnLoad = rightActions.createEl("button", { text: "Load Profile Data" });
    btnLoad.onclick = () => this.loadProfileData();

    // List
    const list = contentEl.createDiv({ cls: "s-restore-profile-list" });

    currentList.forEach((item) => {
      const isP = isPlugins;
      const p = item as ProfilePluginEntry;
      const t = item as ProfileThemeEntry;
      const idOrName = isP ? p.id : t.name;
      const name = isP ? p.name : t.name;
      const version = isP ? p.version : t.version;

      const row = list.createDiv({ cls: "s-restore-profile-item" });
      const label = row.createEl("label");
      const cb = label.createEl("input", { type: "checkbox" });
      cb.checked = currentChecked[idOrName];
      cb.dataset.id = idOrName;
      cb.onchange = async () => {
        currentChecked[idOrName] = cb.checked;
        this.updateSelectionCount();
        if (cb.checked) {
          const exists = await this.app.vault.adapter.exists(
            normalizePath(`.obsidian/${isP ? "plugins" : "themes"}/${idOrName}/${isP ? "main.js" : "theme.css"}`)
          );
          if (exists) {
            new Notice(`${isP ? "Plugin" : "Theme"} already installed: ${name}`);
          }
        }
      };

      const versionText = version ? `v${version}` : "No Release version";
      label.createSpan({ text: `${name} (${versionText})`, cls: "s-restore-profile-id" });

      // Indicate if already installed
      const exists = this.app.vault.adapter.exists(
        normalizePath(`.obsidian/${isP ? "plugins" : "themes"}/${idOrName}/${isP ? "main.js" : "theme.css"}`)
      );
      exists.then(async (e) => {
        if (e) {
          let badgeText = "  |  Installed ✔︎";
          if (!isP && t.active) {
            badgeText = "  |  Active  |  Installed ✔︎";
          }
          row.createSpan({
            text: badgeText,
            cls: "s-restore-profile-badge",
          });
        } else {
          let index = isP ? this.pluginIndex : this.themeIndex;
          if (!index) {
            try {
              index = await fetchIndex(isP ? "plugins" : "themes");
              if (isP) this.pluginIndex = index; else this.themeIndex = index;
            } catch { }
          }
          if (index) {
            const inIndex = isP
              ? index.some(i => i.id === idOrName)
              : index.some(i => i.name === idOrName);
            if (!inIndex) {
              const errSpan = row.createSpan({
                text: "  |  Not found in index",
                cls: "s-restore-profile-error",
              });
              errSpan.style.fontSize = "var(--font-ui-smaller)";
            }
          }
        }
      });
    });

    // Log area
    this.logEl = contentEl.createDiv({ cls: "s-restore-profile-log" });
    this.logEl.style.display = "none";

    // Footer buttons
    const footer = contentEl.createDiv({ cls: "s-restore-profile-footer" });
    footer.style.display = "flex";
    footer.style.justifyContent = "space-between";
    footer.style.alignItems = "center";
    footer.style.marginTop = "20px";

    this.selectedCountLabel = footer.createDiv({ cls: "s-restore-profile-count" });
    this.selectedCountLabel.style.display = "flex";
    this.selectedCountLabel.style.flexDirection = "column";
    this.selectedCountLabel.style.fontSize = "var(--font-ui-smaller)";
    this.selectedCountLabel.style.color = "var(--text-muted)";
    this.updateSelectionCount();

    const rightFooter = footer.createDiv();
    rightFooter.style.display = "flex";
    rightFooter.style.gap = "8px";

    this.btnConfirm = rightFooter.createEl("button", {
      text: "Reinstall selected",
      cls: "mod-cta",
    });
    this.btnConfirm.onclick = () => this.runInstall();

    this.btnUninstall = rightFooter.createEl("button", {
      text: "Uninstall selected",
      cls: "s-restore-profile-btn-danger",
    });
    this.btnUninstall.onclick = () => this.runUninstall();

    const btnClose = rightFooter.createEl("button", { text: "Close" });
    btnClose.onclick = () => this.close();
  }

  updateSelectionCount() {
    const pCount = this.profilePlugins.filter(p => this.checkedPlugins[p.id]).length;
    const tCount = this.profileThemes.filter(t => this.checkedThemes[t.name]).length;
    if (this.selectedCountLabel) {
      this.selectedCountLabel.empty();
      this.selectedCountLabel.createDiv({ text: `Plugins: ${pCount}` });
      this.selectedCountLabel.createDiv({ text: `Themes: ${tCount}` });
    }
  }

  appendLog(msg: string) {
    this.log.push(msg);
    const line = this.logEl.createEl("div", { text: msg });
    line.scrollIntoView({ block: "end" });
  }

  async generateProfileData() {
    const selectedPlugins = this.profilePlugins.filter(p => this.checkedPlugins[p.id]);
    const selectedThemes = this.profileThemes.filter(t => this.checkedThemes[t.name]);

    if (!selectedPlugins.length && !selectedThemes.length) {
      new Notice("No items selected to generate data.");
      return;
    }

    new Notice("Generating Profile Data...");
    try {
      const pIndex = await fetchIndex("plugins");
      const pRepoMap: Record<string, string> = {};
      pIndex.forEach((i) => { if (i.id) pRepoMap[i.id] = i.repo; });

      const tIndex = await fetchIndex("themes");
      const tRepoMap: Record<string, string> = {};
      tIndex.forEach((i) => (tRepoMap[i.name] = i.repo));

      const exportData: ProfileData = {
        plugins: selectedPlugins.map(p => ({ ...p, repo: pRepoMap[p.id] || p.repo })),
        themes: selectedThemes.map(t => ({ ...t, repo: tRepoMap[t.name] || t.repo }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "s-resprldata-obsidian.json";
      a.click();
      URL.revokeObjectURL(url);

      new Notice("Profile Data Generated!");
    } catch (e) {
      new Notice("Failed to generate Profile Data.");
      console.error(e);
    }
  }

  loadProfileData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev: ProgressEvent<FileReader>) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (Array.isArray(data)) {
            // Legacy format
            this.profilePlugins = data;
            this.profileThemes = [];
          } else {
            // New format
            this.profilePlugins = data.plugins || [];
            this.profileThemes = data.themes || [];
          }

          this.checkedPlugins = {};
          this.checkedThemes = {};
          this.profilePlugins.forEach((p) => (this.checkedPlugins[p.id] = true));
          this.profileThemes.forEach((t) => (this.checkedThemes[t.name] = true));

          this.refreshUI();
          new Notice("Profile Data Loaded!");
        } catch (err) {
          new Notice("Failed to parse JSON.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async runInstall() {
    if (this.installing) return;

    const selectedPlugins = this.profilePlugins.filter((p) => this.checkedPlugins[p.id]);
    const selectedThemes = this.profileThemes.filter((t) => this.checkedThemes[t.name]);

    if (!selectedPlugins.length && !selectedThemes.length) {
      new Notice("No items selected.");
      return;
    }

    this.installing = true;
    this.btnConfirm.disabled = true;
    this.btnConfirm.setText("Installing...");
    this.logEl.style.display = "block";
    this.logEl.empty();

    let success = 0, skip = 0, fail = 0;

    // Install Plugins
    if (selectedPlugins.length > 0) {
      this.appendLog("📥 Fetching plugin index...");
      let index: PluginIndexEntry[] = [];
      try {
        index = await fetchIndex("plugins");
      } catch {
        this.appendLog("❌ Failed to fetch plugin index.");
        this.installing = false;
        this.btnConfirm.disabled = false;
        this.btnConfirm.setText("Reinstall selected");
        return;
      }
      const repoMap: Record<string, string> = {};
      index.forEach((p) => { if (p.id) repoMap[p.id] = p.repo; });

      for (const p of selectedPlugins) {
        const id = p.id;
        this.appendLog(`\n── [Plugin] ${p.name}`);

        const alreadyInstalled = await this.app.vault.adapter.exists(normalizePath(`.obsidian/plugins/${id}/main.js`));
        if (alreadyInstalled) {
          this.appendLog(`  ⏭ Already installed, skipping.`);
          skip++;
          continue;
        }

        const repo = p.repo || repoMap[id];
        if (!repo) {
          this.appendLog(`  ⚠️ Not found in the official index.`);
          fail++;
          continue;
        }

        const result = await installItem("plugins", id, repo, this.app.vault, (msg) => this.appendLog(msg));

        if (result.success) {
          this.appendLog(`  ✅ Installed (${result.method})`);
          if (p.enabled) {
            const cpPath = normalizePath(".obsidian/community-plugins.json");
            let cpList: string[] = [];
            try {
              const cpRaw = await this.app.vault.adapter.read(cpPath);
              cpList = JSON.parse(cpRaw);
            } catch { }
            if (!cpList.includes(id)) {
              cpList.push(id);
              await this.app.vault.adapter.write(cpPath, JSON.stringify(cpList, null, 2));
              this.appendLog(`  ✅ Enabled`);
            }
          }
          success++;
        } else {
          this.appendLog(`  ❌ Installation failed.`);
          fail++;
        }
      }
    }

    // Install Themes
    if (selectedThemes.length > 0) {
      this.appendLog("\n📥 Fetching theme index...");
      let index: PluginIndexEntry[] = [];
      try {
        index = await fetchIndex("themes");
      } catch {
        this.appendLog("❌ Failed to fetch theme index.");
      }
      const repoMap: Record<string, string> = {};
      index.forEach((t) => (repoMap[t.name] = t.repo));

      for (const t of selectedThemes) {
        const name = t.name;
        this.appendLog(`\n── [Theme] ${name}`);

        const alreadyInstalled = await this.app.vault.adapter.exists(normalizePath(`.obsidian/themes/${name}/theme.css`));
        if (alreadyInstalled) {
          this.appendLog(`  ⏭ Already installed, skipping.`);
          skip++;
          continue;
        }

        const repo = t.repo || repoMap[name];
        if (!repo) {
          this.appendLog(`  ⚠️ Not found in the official index.`);
          fail++;
          continue;
        }

        const result = await installItem("themes", name, repo, this.app.vault, (msg) => this.appendLog(msg));

        if (result.success) {
          this.appendLog(`  ✅ Installed (${result.method})`);
          if (t.active) {
            const apPath = normalizePath(".obsidian/appearance.json");
            let apData: any = {};
            try {
              const apRaw = await this.app.vault.adapter.read(apPath);
              apData = JSON.parse(apRaw);
            } catch { }
            apData.cssTheme = name;
            await this.app.vault.adapter.write(apPath, JSON.stringify(apData, null, 2));
            this.appendLog(`  ✅ Set as active theme`);
          }
          success++;
        } else {
          this.appendLog(`  ❌ Installation failed.`);
          fail++;
        }
      }
    }

    this.appendLog(`\n══════════════════════════`);
    this.appendLog(`✅ Installed : ${success}`);
    this.appendLog(`⏭ Skipped   : ${skip}`);
    this.appendLog(`❌ Failed    : ${fail}`);
    this.appendLog(`\nRestart Obsidian to activate the installed plugins/themes.`);

    this.installing = false;
    this.btnConfirm.disabled = false;
    this.btnConfirm.setText("Reinstall selected");
  }

  async runUninstall() {
    if (this.installing) return;

    const selectedPlugins = this.profilePlugins.filter((p) => this.checkedPlugins[p.id]);
    const selectedThemes = this.profileThemes.filter((t) => this.checkedThemes[t.name]);

    if (!selectedPlugins.length && !selectedThemes.length) {
      new Notice("No items selected.");
      return;
    }

    new ConfirmModal(
      this.app,
      `Are you sure you want to uninstall ${selectedPlugins.length} plugin(s) and ${selectedThemes.length} theme(s)? This will delete their files.`,
      () => this.executeUninstall(selectedPlugins, selectedThemes)
    ).open();
  }

  async executeUninstall(selectedPlugins: ProfilePluginEntry[], selectedThemes: ProfileThemeEntry[]) {
    this.installing = true;
    this.btnConfirm.disabled = true;
    this.btnUninstall.disabled = true;
    this.btnUninstall.setText("Uninstalling...");
    this.logEl.style.display = "block";
    this.logEl.empty();
    this.log = [];

    let success = 0, skip = 0, fail = 0;

    for (const p of selectedPlugins) {
      const id = p.id;
      this.appendLog(`\n── Uninstalling [Plugin] ${p.name}`);

      const isInstalled = await this.app.vault.adapter.exists(normalizePath(`.obsidian/plugins/${id}/main.js`));
      if (!isInstalled) {
        this.appendLog(`  ⏭ Not installed, skipping.`);
        skip++;
        continue;
      }

      try {
        if ((this.app as any).plugins && typeof (this.app as any).plugins.uninstallPlugin === "function") {
          this.appendLog(`  Removing plugin files and disabling...`);
          console.warn(`[S-Restore Profile] Using internal API 'uninstallPlugin' for ${id}`);
          await (this.app as any).plugins.uninstallPlugin(id);
        } else {
          // Fallback if API not available
          this.appendLog(`  Removing plugin folder...`);
          await this.app.vault.adapter.rmdir(normalizePath(`.obsidian/plugins/${id}`), true);
        }
        this.appendLog(`  ✅ Uninstalled successfully.`);
        success++;
      } catch (e: unknown) {
        this.appendLog(`  ❌ Failed: ${(e as Error).message}`);
        fail++;
      }
    }

    for (const t of selectedThemes) {
      const name = t.name;
      this.appendLog(`\n── Uninstalling [Theme] ${name}`);

      const dir = normalizePath(`.obsidian/themes/${name}`);
      const isInstalled = await this.app.vault.adapter.exists(dir);
      if (!isInstalled) {
        this.appendLog(`  ⏭ Not installed, skipping.`);
        skip++;
        continue;
      }

      try {
        this.appendLog(`  Removing theme folder...`);
        await this.app.vault.adapter.rmdir(dir, true);

        // Disable if active
        const apPath = normalizePath(".obsidian/appearance.json");
        let apData: any = {};
        try {
          const apRaw = await this.app.vault.adapter.read(apPath);
          apData = JSON.parse(apRaw);
          if (apData.cssTheme === name) {
            apData.cssTheme = "";
            await this.app.vault.adapter.write(apPath, JSON.stringify(apData, null, 2));
            this.appendLog(`  ✅ Removed from active theme.`);
          }
        } catch { }

        this.appendLog(`  ✅ Uninstalled successfully.`);
        success++;
      } catch (e: unknown) {
        this.appendLog(`  ❌ Failed: ${(e as Error).message}`);
        fail++;
      }
    }

    this.appendLog(`\n══════════════════════════`);
    this.appendLog(`✅ Uninstalled : ${success}`);
    this.appendLog(`⏭ Skipped     : ${skip}`);
    this.appendLog(`❌ Failed      : ${fail}`);

    this.installing = false;
    this.btnConfirm.disabled = false;
    this.btnUninstall.disabled = false;
    this.btnUninstall.setText("Uninstall selected");

    this.refreshUI();
  }

  refreshUI() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "S-Restore Profile" });
    this.renderList(this.contentEl);
    if (this.log.length > 0) {
      this.logEl.style.display = "block";
      this.logEl.empty();
      this.log.forEach((msg) => {
        this.logEl.createEl("div", { text: msg });
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const S_DOWNLOAD_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="7 11 12 16 17 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 3c-1.8 0-3 1-3 2.5s1.2 2 3 2.5 3 1.2 3 2.5-1.2 2.5-3 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

export default class SRestoreProfile extends Plugin {
  async onload() {
    addIcon("s-restore-profile-icon", S_DOWNLOAD_ICON);

    this.addCommand({
      id: "open-s-restore-profile",
      name: "Open S-Restore Profile",
      callback: () => new ReinstallerModal(this.app).open(),
    });

    this.addRibbonIcon("s-restore-profile-icon", "S-Restore Profile", () => {
      new ReinstallerModal(this.app).open();
    });
  }
}