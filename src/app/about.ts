import { checkForUpdate, getAppVersion, openExternal } from "./bridge.js";

/**
 * The About panel: app identity, version, and an on-demand check against the
 * project's latest GitHub release. The check only ever runs when the reader
 * clicks the button — MDX does not phone home on its own.
 */
export class AboutPanel {
  constructor(
    private readonly root: HTMLElement,
    private readonly version: HTMLElement,
    private readonly checkButton: HTMLButtonElement,
    private readonly status: HTMLElement,
    close: HTMLElement,
    links: { repo: HTMLElement; issues: HTMLElement; license: HTMLElement },
  ) {
    close.addEventListener("click", () => this.close());
    this.root.addEventListener("click", (event) => {
      if (event.target === this.root) this.close();
    });
    document.addEventListener("keydown", (event) => {
      if (this.isOpen && event.key === "Escape") this.close();
    });

    this.checkButton.addEventListener("click", () => void this.check());

    for (const [el, url] of [
      [links.repo, "https://github.com/RavilesX/MDX"],
      [links.issues, "https://github.com/RavilesX/MDX/issues"],
      [links.license, "https://github.com/RavilesX/MDX/blob/main/LICENSE"],
    ] as const) {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        void openExternal(url);
      });
    }
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    this.resetStatus();
    void getAppVersion().then((v) => (this.version.textContent = `Version ${v}`));
  }

  close(): void {
    this.root.hidden = true;
  }

  private resetStatus(): void {
    this.status.hidden = true;
    this.status.textContent = "";
    this.status.removeAttribute("data-kind");
    this.checkButton.disabled = false;
    this.checkButton.textContent = "Check for updates";
  }

  private async check(): Promise<void> {
    this.checkButton.disabled = true;
    this.checkButton.textContent = "Checking…";
    this.status.hidden = true;

    try {
      const result = await checkForUpdate();
      this.status.hidden = false;
      if (result.hasUpdate) {
        this.status.dataset.kind = "update";
        this.status.replaceChildren();
        this.status.append(`Version ${result.latest} is available — `);
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = "download it";
        link.addEventListener("click", (event) => {
          event.preventDefault();
          void openExternal(result.url);
        });
        this.status.append(link, ".");
      } else {
        this.status.dataset.kind = "current";
        this.status.textContent = `You're up to date (${result.current}).`;
      }
    } catch (error) {
      this.status.hidden = false;
      this.status.dataset.kind = "error";
      this.status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.checkButton.disabled = false;
      this.checkButton.textContent = "Check for updates";
    }
  }
}
