# S-Restore Profile

An [Obsidian](https://obsidian.md) plugin that allows you to bulk reinstall and synchronize your community plugins and themes across different vaults or machines, without relying on manual searches in the built-in community store.

Think of it as a **declarative package restorer and profile synchronizer for Obsidian** — a portable, lightweight way to maintain a consistent environment everywhere you work.

---

## Why S-Restore Profile?

When managing multiple vaults or moving your workspace to a new machine, Obsidian's built-in manager requires you to manually search, install, and configure each plugin and theme one by one. 

With **S-Restore Profile**, you can:
- **Sync Vaults Instantly:** Export your current set of plugins and themes into a single, lightweight profile file (`s-resprldata-obsidian.json`) and import it into any other vault to bulk-install and activate everything in one click.
- **Maintain Standards:** Keep the same visual themes and workflow-essential plugins consistent across personal, work, and secondary vaults.
- **Easy Recovery:** Easily restore your plugins and themes after backups or vault migrations.

---

## Features

- **Tabbed Interface:** Separate, clean tabs for managing **Plugins** and **Themes**.
- **Active Theme Tracking:** Identifies which theme is currently active in your vault and automatically sets it as active upon reinstallation.
- **Portable Profiles:** Export selected items into a custom JSON profile file (using any filename you choose) and import it into another vault.
- **Intelligent Skipping:** Automatically detects and skips already-installed plugins and themes to save bandwidth.
- **Quick Selection:** Separate "Select all" and "Deselect all" controls for each tab, with real-time selection counters in the footer.
- **Safe Execution:** Self-exclusion prevents the plugin from accidentally uninstalling or modifying itself.
- **Real-Time Logging:** Verbose logs showing download steps, versions, and installation success directly inside the modal.
- **Ribbon Access:** Quick-launch ribbon icon (`s-restore-profile-icon`) added to the left sidebar.

---

## Usage

1. **Open S-Restore Profile:**
   - Click the custom download icon (featuring an "S") in the left ribbon sidebar, OR
   - Open the command palette (`Ctrl/Cmd + P`) and run `S-Restore Profile: Open S-Restore Profile`.
2. **Select Items:**
   - Use the **Plugins** and **Themes** tabs to check or uncheck items.
   - Use **Select all** or **Deselect all** to batch-toggle checkboxes for each tab.
3. **Export/Import Profiles:**
   - Click **Generate Profile Data** to export your currently checked selection to a custom `.json` file (you can name it whatever you like).
   - Click **Load Profile Data** to import a saved profile file and automatically check the corresponding items for installation.
4. **Reinstall / Uninstall:**
   - Click **Reinstall selected** to download and install all checked items.
   - Click **Uninstall selected** to delete the files of checked items from your vault directory (requires confirmation).
5. **Activate:**
   - Restart Obsidian to fully load and activate the newly installed plugins.

---

## How It Works (Download Pipeline)

S-Restore Profile bypasses CORS restrictions and GitHub rate limits by utilizing Obsidian's native `requestUrl` API through a three-stage fallback download pipeline:

1. **Plan A (Direct Download):** Resolves the repository name, fetches `manifest.json` from the main branch to find the release version, and downloads release assets (`main.js`, `manifest.json`, `styles.css`, or `theme.css`) directly from the corresponding GitHub release tag.
2. **Plan B (GitHub API Fallback):** If direct download fails, it queries the GitHub Releases API to retrieve the correct download URLs for the release assets.
3. **Plan C (Raw Files Fallback):** If the repository does not have a formal Release published (common for many custom themes), it downloads the required files directly from the default branch (e.g. `main` or `master`).

> [!NOTE]
> Some themes or plugins do not publish formal GitHub Releases and instead host raw files in their main branch. The plugin will successfully install them via **Plan C**. If a theme/plugin installed this way does not declare a version number in its source manifest, it will be labeled as **"No Release version"** next to its name.

---

## Requirements

- Obsidian `1.4.0` or higher.
- Desktop only (requires file system API access).

---

## License

This project is licensed under the [MIT License](LICENSE).
