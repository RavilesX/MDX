/** A small popup menu: declarative items in, DOM and keyboard handling out. */

export type MenuItem =
  | { kind: "action"; label: string; hint?: string; disabled?: boolean; run: () => void }
  | { kind: "toggle"; label: string; hint?: string; checked: boolean; run: () => void }
  | { kind: "choice"; label: string; options: Array<{ value: string; label: string }>; value: string; run: (value: string) => void }
  | { kind: "stepper"; label: string; value: string; resetTitle: string; decrement: () => void; increment: () => void; reset: () => void }
  | { kind: "separator"; label?: string };

export class Menu {
  private open = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly trigger: HTMLElement,
    private readonly build: () => MenuItem[],
  ) {
    this.trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggle();
    });

    document.addEventListener("click", (event) => {
      if (this.open && !this.root.contains(event.target as Node)) this.hide();
    });

    document.addEventListener("keydown", (event) => {
      if (this.open && event.key === "Escape") {
        event.preventDefault();
        this.hide();
      }
    });
  }

  toggle(): void {
    this.open ? this.hide() : this.show();
  }

  show(): void {
    this.render();
    this.root.hidden = false;
    this.open = true;
    this.trigger.setAttribute("aria-expanded", "true");
    this.root.querySelector<HTMLElement>("button, select")?.focus();
  }

  hide(): void {
    this.root.hidden = true;
    this.open = false;
    this.trigger.setAttribute("aria-expanded", "false");
  }

  /** Rebuild in place; used after a toggle changes a checked state. */
  refresh(): void {
    if (this.open) this.render();
  }

  private render(): void {
    this.root.replaceChildren();

    for (const item of this.build()) {
      if (item.kind === "separator") {
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        if (item.label) sep.textContent = item.label;
        this.root.appendChild(sep);
        continue;
      }

      if (item.kind === "choice") {
        const row = document.createElement("label");
        row.className = "menu-row";
        row.textContent = item.label;

        const select = document.createElement("select");
        for (const option of item.options) {
          const el = document.createElement("option");
          el.value = option.value;
          el.textContent = option.label;
          el.selected = option.value === item.value;
          select.appendChild(el);
        }
        select.addEventListener("change", () => {
          item.run(select.value);
          this.refresh();
        });
        row.appendChild(select);
        this.root.appendChild(row);
        continue;
      }

      if (item.kind === "stepper") {
        const row = document.createElement("div");
        row.className = "menu-row";
        row.textContent = item.label;

        const group = document.createElement("div");
        group.className = "menu-stepper";
        const step = (text: string, title: string, run: () => void): HTMLButtonElement => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = text;
          button.title = title;
          button.addEventListener("click", () => {
            run();
            this.refresh();
          });
          return button;
        };
        const value = step(item.value, item.resetTitle, item.reset);
        value.className = "menu-stepper-value";
        group.append(step("−", `${item.label} out`, item.decrement), value, step("+", `${item.label} in`, item.increment));
        row.appendChild(group);
        this.root.appendChild(row);
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-item";
      button.disabled = item.kind === "action" && Boolean(item.disabled);
      button.setAttribute("role", "menuitem");

      if (item.kind === "toggle") {
        button.classList.toggle("checked", item.checked);
        button.setAttribute("aria-checked", String(item.checked));
        button.setAttribute("role", "menuitemcheckbox");
      }

      const label = document.createElement("span");
      label.textContent = item.label;
      button.appendChild(label);

      if (item.hint) {
        const hint = document.createElement("kbd");
        hint.textContent = item.hint;
        button.appendChild(hint);
      }

      button.addEventListener("click", () => {
        item.run();
        if (item.kind === "toggle") this.refresh();
        else this.hide();
      });

      this.root.appendChild(button);
    }
  }
}
