import { Editor, mergeAttributes } from "@tiptap/react";
import { Fragment, Node as PMNode } from "@tiptap/pm/model";
import { Table, TableView, updateColumns } from "@tiptap/extension-table";
import { selectedRect } from "@tiptap/pm/tables";
import type { EditorView, ViewMutationRecord } from "@tiptap/pm/view";

export type TableCellMode = "wrap" | "truncate";
export type TableViewMode = "table" | "cards";

const WIDE_TABLE_COL_THRESHOLD = 4;
const BREAKOUT_TABLE_COL_THRESHOLD = 5;
const WIDE_COL_MIN_WIDTH = 160;
const AUTOFIT_MIN_COL_WIDTH = 78;
const AUTOFIT_MAX_COL_WIDTH = 340;

let measureCtx: CanvasRenderingContext2D | null = null;

function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  return measureCtx;
}

function measureTextWidthPx(text: string, isHeader: boolean): number {
  const ctx = getTextMeasureContext();
  if (!ctx) return text.length * 8;
  ctx.font = isHeader
    ? "600 13px system-ui, -apple-system, sans-serif"
    : "400 14px system-ui, -apple-system, sans-serif";
  return ctx.measureText(text).width;
}

function getTableColumnCount(node: PMNode): number {
  const firstRow = node.firstChild;
  if (!firstRow) return 0;
  let cols = 0;
  for (let i = 0; i < firstRow.childCount; i += 1) {
    cols += Number(firstRow.child(i).attrs?.colspan ?? 1) || 1;
  }
  return cols;
}

function getEffectiveCellMinWidth(node: PMNode, baseMinWidth: number): number {
  const colCount = getTableColumnCount(node);
  return colCount >= WIDE_TABLE_COL_THRESHOLD
    ? Math.max(baseMinWidth, WIDE_COL_MIN_WIDTH)
    : baseMinWidth;
}

function serializeCellParagraphText(cellNode: PMNode): string {
  const lines: string[] = [];
  cellNode.forEach((child) => {
    lines.push(child.textContent || "");
  });
  return lines.join("\n");
}

function buildCellContentFromText(
  schema: PMNode["type"]["schema"],
  text: string,
): Fragment {
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) return Fragment.empty;
  const rawLines = text.split("\n");
  const paragraphs = rawLines.map((line) =>
    line.length > 0
      ? paragraphType.create(null, schema.text(line))
      : paragraphType.create(),
  );
  return Fragment.fromArray(paragraphs);
}

/**
 * Measure and apply content-fitted column widths (`colwidth`) to either
 * a single column (double-click resize border) or all columns (Auto-Fit button).
 */
export function autoFitTableColumns(
  editor: Editor,
  singleColIndex?: number,
): boolean {
  if (!editor.isActive("table")) return false;
  let rect;
  try {
    rect = selectedRect(editor.state);
  } catch {
    return false;
  }
  const { map, table, tableStart } = rect;
  const numCols = map.width;
  const numRows = map.height;
  if (numCols <= 0 || numRows <= 0) return false;

  const targetCols =
    typeof singleColIndex === "number" &&
    singleColIndex >= 0 &&
    singleColIndex < numCols
      ? [singleColIndex]
      : Array.from({ length: numCols }, (_, i) => i);

  const computedColWidths = new Map<number, number>();
  for (const col of targetCols) {
    let widest = 0;
    for (let row = 0; row < numRows; row += 1) {
      const cellOffset = map.map[row * numCols + col];
      const cell = table.nodeAt(cellOffset);
      if (!cell) continue;
      if ((Number(cell.attrs?.colspan ?? 1) || 1) > 1) continue;
      const isHeader = cell.type.name === "tableHeader";
      const lines = serializeCellParagraphText(cell).split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const px = measureTextWidthPx(trimmed, isHeader);
        if (px > widest) widest = px;
      }
    }
    // Cell horizontal padding (22px) + sort/breathing buffer (16px)
    const ideal = Math.round(
      Math.min(
        AUTOFIT_MAX_COL_WIDTH,
        Math.max(AUTOFIT_MIN_COL_WIDTH, widest + 38),
      ),
    );
    computedColWidths.set(col, ideal);
  }

  const tr = editor.state.tr;
  const seenOffsets = new Set<number>();

  for (let row = 0; row < numRows; row += 1) {
    for (let col = 0; col < numCols; col += 1) {
      const cellOffset = map.map[row * numCols + col];
      if (seenOffsets.has(cellOffset)) continue;
      seenOffsets.add(cellOffset);

      const cell = table.nodeAt(cellOffset);
      if (!cell) continue;
      const colspan = Number(cell.attrs?.colspan ?? 1) || 1;
      const existingWidths: Array<number | null> = Array.isArray(
        cell.attrs?.colwidth,
      )
        ? [...cell.attrs.colwidth]
        : Array.from({ length: colspan }, () => null);

      let touched = false;
      const nextWidths = existingWidths.map((prevW, spanIdx) => {
        const target = computedColWidths.get(col + spanIdx);
        if (typeof target === "number") {
          touched = true;
          return target;
        }
        return prevW ?? AUTOFIT_MIN_COL_WIDTH;
      });

      if (!touched) continue;

      const absPos = tableStart + cellOffset;
      tr.setNodeMarkup(absPos, undefined, {
        ...cell.attrs,
        colwidth: nextWidths,
      });
    }
  }

  if (!tr.docChanged) return false;
  editor.view.dispatch(tr);
  return true;
}

export function getActiveResizeColumnIndex(
  view: EditorView,
  event: MouseEvent,
): number | null {
  const target = event.target as HTMLElement | null;
  if (!target) return null;

  const cellEl = target.closest("td, th") as HTMLTableCellElement | null;
  const tableEl = cellEl?.closest("table");
  if (!cellEl || !tableEl || !view.dom.contains(tableEl)) return null;

  const isHandle = Boolean(target.closest(".column-resize-handle"));
  const rect = cellEl.getBoundingClientRect();
  const nearRightEdge = Math.abs(event.clientX - rect.right) <= 7;
  const nearLeftEdge = Math.abs(event.clientX - rect.left) <= 7;

  if (!isHandle && !nearRightEdge && !nearLeftEdge) return null;

  const rowEl = cellEl.parentElement as HTMLTableRowElement | null;
  if (!rowEl) return null;

  let colIdx = 0;
  for (const child of Array.from(rowEl.children)) {
    const span = Number((child as HTMLTableCellElement).colSpan || 1);
    if (child === cellEl) {
      return nearLeftEdge && !isHandle ? Math.max(0, colIdx - 1) : colIdx;
    }
    colIdx += span;
  }
  return null;
}

export class KansoTableView extends TableView {
  view?: EditorView;
  scrollWrap: HTMLDivElement;
  leftFade: HTMLDivElement;
  rightFade: HTMLDivElement;
  cardsContainer: HTMLDivElement;
  resizeObserver: ResizeObserver | null = null;
  private onScrollBound: () => void;

  constructor(
    node: PMNode,
    cellMinWidth: number,
    view?: EditorView,
    HTMLAttributes: Record<string, unknown> = {},
  ) {
    const effectiveMin = getEffectiveCellMinWidth(node, cellMinWidth);
    super(node, effectiveMin, view, HTMLAttributes);
    this.view = view;

    // Replace outer wrapper layout so fade shadows & Row-Cards stay cleanly outside overflow scroll
    this.dom.className = "kanso-table-shell";

    this.scrollWrap = document.createElement("div");
    this.scrollWrap.className = "tableWrapper";
    this.scrollWrap.appendChild(this.table);
    this.dom.appendChild(this.scrollWrap);

    this.leftFade = document.createElement("div");
    this.leftFade.className = "kanso-table-fade kanso-table-fade-left";
    this.leftFade.setAttribute("aria-hidden", "true");
    this.dom.appendChild(this.leftFade);

    this.rightFade = document.createElement("div");
    this.rightFade.className = "kanso-table-fade kanso-table-fade-right";
    this.rightFade.setAttribute("aria-hidden", "true");
    this.dom.appendChild(this.rightFade);

    this.cardsContainer = document.createElement("div");
    this.cardsContainer.className = "kanso-table-cards";
    this.dom.appendChild(this.cardsContainer);

    this.onScrollBound = () => this.syncScrollFades();
    this.scrollWrap.addEventListener("scroll", this.onScrollBound, {
      passive: true,
    });

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.syncScrollFades());
      this.resizeObserver.observe(this.scrollWrap);
      this.resizeObserver.observe(this.table);
    }

    this.syncNodeState(node);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => this.syncScrollFades());
    }
  }

  private getTableNodePos(): number | null {
    if (!this.view) return null;
    try {
      const pos = this.view.posAtDOM(this.table, 0);
      const $pos = this.view.state.doc.resolve(pos);
      for (let d = $pos.depth; d >= 0; d -= 1) {
        if ($pos.node(d).type.name === "table") {
          return $pos.before(d);
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private updateTableAttrs(patch: Record<string, unknown>) {
    if (!this.view) return;
    const tablePos = this.getTableNodePos();
    if (tablePos == null) return;
    const current = this.view.state.doc.nodeAt(tablePos);
    if (!current || current.type.name !== "table") return;
    const tr = this.view.state.tr.setNodeMarkup(tablePos, undefined, {
      ...current.attrs,
      ...patch,
    });
    this.view.dispatch(tr);
  }

  private appendBodyRowFromCards() {
    if (!this.view) return;
    const tablePos = this.getTableNodePos();
    if (tablePos == null) return;
    const tableNode = this.view.state.doc.nodeAt(tablePos);
    if (!tableNode || tableNode.type.name !== "table") return;

    const schema = this.view.state.schema;
    const rowType = schema.nodes.tableRow;
    const cellType = schema.nodes.tableCell;
    const paragraphType = schema.nodes.paragraph;
    if (!rowType || !cellType || !paragraphType) return;

    const colCount = Math.max(1, getTableColumnCount(tableNode));
    const newCells = Array.from({ length: colCount }, () =>
      cellType.create(null, paragraphType.create()),
    );
    const newRow = rowType.create(null, newCells);
    const insertPos = tablePos + tableNode.nodeSize - 1;
    const tr = this.view.state.tr.insert(insertPos, newRow);
    this.view.dispatch(tr);
  }

  private deleteBodyRowFromCards(rowIndex: number) {
    if (!this.view) return;
    const tablePos = this.getTableNodePos();
    if (tablePos == null) return;
    const tableNode = this.view.state.doc.nodeAt(tablePos);
    if (!tableNode || tableNode.type.name !== "table") return;
    if (rowIndex < 0 || rowIndex >= tableNode.childCount) return;

    let offset = tablePos + 1;
    for (let i = 0; i < rowIndex; i += 1) {
      offset += tableNode.child(i).nodeSize;
    }
    const targetRow = tableNode.child(rowIndex);
    const tr = this.view.state.tr.delete(offset, offset + targetRow.nodeSize);
    this.view.dispatch(tr);
  }

  private updateCellFromCardInput(
    rowIndex: number,
    cellIndex: number,
    nextText: string,
  ) {
    if (!this.view) return;
    const tablePos = this.getTableNodePos();
    if (tablePos == null) return;
    const tableNode = this.view.state.doc.nodeAt(tablePos);
    if (!tableNode || tableNode.type.name !== "table") return;
    if (rowIndex < 0 || rowIndex >= tableNode.childCount) return;

    let rowPos = tablePos + 1;
    for (let r = 0; r < rowIndex; r += 1) {
      rowPos += tableNode.child(r).nodeSize;
    }
    const rowNode = tableNode.child(rowIndex);
    if (cellIndex < 0 || cellIndex >= rowNode.childCount) return;

    let cellPos = rowPos + 1;
    for (let c = 0; c < cellIndex; c += 1) {
      cellPos += rowNode.child(c).nodeSize;
    }
    const cellNode = rowNode.child(cellIndex);
    if (serializeCellParagraphText(cellNode) === nextText) return;

    const replacement = buildCellContentFromText(this.view.state.schema, nextText);
    const tr = this.view.state.tr.replaceWith(
      cellPos + 1,
      cellPos + cellNode.nodeSize - 1,
      replacement,
    );
    this.view.dispatch(tr);
  }

  private syncScrollFades() {
    const el = this.scrollWrap;
    if (!el) return;
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const canScrollLeft = maxScrollLeft > 2 && el.scrollLeft > 2;
    const canScrollRight =
      maxScrollLeft > 2 && el.scrollLeft < maxScrollLeft - 2;

    if (canScrollLeft) this.dom.setAttribute("data-scroll-left", "true");
    else this.dom.removeAttribute("data-scroll-left");

    if (canScrollRight) this.dom.setAttribute("data-scroll-right", "true");
    else this.dom.removeAttribute("data-scroll-right");
  }

  private renderRowCards(node: PMNode) {
    const container = this.cardsContainer;
    const activeEl = document.activeElement as HTMLTextAreaElement | null;
    const focusedCellKey =
      activeEl && container.contains(activeEl)
        ? activeEl.getAttribute("data-cell-key")
        : null;

    const totalRows = node.childCount;
    const firstRow = totalRows > 0 ? node.child(0) : null;
    const hasHeader = Boolean(
      firstRow &&
        firstRow.childCount > 0 &&
        firstRow.firstChild?.type.name === "tableHeader",
    );

    const colLabels: string[] = [];
    const colCount = Math.max(1, getTableColumnCount(node));
    for (let c = 0; c < colCount; c += 1) {
      const headerText =
        hasHeader && firstRow && c < firstRow.childCount
          ? firstRow.child(c).textContent.trim()
          : "";
      colLabels.push(headerText || `Column ${c + 1}`);
    }

    const startRowIdx = hasHeader ? 1 : 0;
    const bodyRowCount = Math.max(0, totalRows - startRowIdx);

    // Build header + controls strip once or update cleanly when not typing in focused textarea
    if (focusedCellKey) {
      // Keep active textarea intact; sync non-focused fields only
      const textareas = container.querySelectorAll<HTMLTextAreaElement>(
        "textarea[data-cell-key]",
      );
      textareas.forEach((ta) => {
        const key = ta.getAttribute("data-cell-key");
        if (!key || key === focusedCellKey) return;
        const [rStr, cStr] = key.split(":");
        const r = Number(rStr);
        const c = Number(cStr);
        if (
          !Number.isNaN(r) &&
          !Number.isNaN(c) &&
          r < node.childCount &&
          c < node.child(r).childCount
        ) {
          const nextVal = serializeCellParagraphText(node.child(r).child(c));
          if (ta.value !== nextVal) ta.value = nextVal;
        }
      });
      return;
    }

    container.innerHTML = "";

    const bar = document.createElement("div");
    bar.className = "kanso-table-cards-bar";

    const meta = document.createElement("span");
    meta.className = "kanso-table-cards-meta";
    meta.textContent = `${bodyRowCount} ${bodyRowCount === 1 ? "row" : "rows"} · ${colCount} cols`;
    bar.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "kanso-table-cards-actions";

    if (this.view?.editable) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "kanso-table-cards-btn";
      addBtn.textContent = "+ Row";
      addBtn.addEventListener("click", () => this.appendBodyRowFromCards());
      actions.appendChild(addBtn);
    }

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "kanso-table-cards-btn kanso-table-cards-btn-primary";
    backBtn.textContent = "Table view";
    backBtn.addEventListener("click", () =>
      this.updateTableAttrs({ viewMode: "table" }),
    );
    actions.appendChild(backBtn);

    bar.appendChild(actions);
    container.appendChild(bar);

    if (bodyRowCount === 0) {
      const empty = document.createElement("div");
      empty.className = "kanso-table-cards-empty";
      empty.textContent = "No data rows yet. Tap + Row to add one.";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "kanso-table-cards-list";

    for (let r = startRowIdx; r < totalRows; r += 1) {
      const rowNode = node.child(r);
      const card = document.createElement("div");
      card.className = "kanso-table-card";

      const cardHead = document.createElement("div");
      cardHead.className = "kanso-table-card-head";

      const rowBadge = document.createElement("span");
      rowBadge.className = "kanso-table-card-index";
      rowBadge.textContent = `Row ${r - startRowIdx + 1}`;
      cardHead.appendChild(rowBadge);

      if (this.view?.editable && bodyRowCount > 1) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "kanso-table-card-delete";
        delBtn.textContent = "Remove";
        delBtn.addEventListener("click", () => this.deleteBodyRowFromCards(r));
        cardHead.appendChild(delBtn);
      }

      card.appendChild(cardHead);

      const fields = document.createElement("div");
      fields.className = "kanso-table-card-fields";

      for (let c = 0; c < rowNode.childCount; c += 1) {
        const cellNode = rowNode.child(c);
        const field = document.createElement("div");
        field.className = "kanso-table-card-field";

        const label = document.createElement("label");
        label.className = "kanso-table-card-label";
        label.textContent = colLabels[c] ?? `Column ${c + 1}`;
        field.appendChild(label);

        const textarea = document.createElement("textarea");
        textarea.rows = 1;
        textarea.className = "kanso-table-card-input";
        textarea.setAttribute("data-cell-key", `${r}:${c}`);
        textarea.value = serializeCellParagraphText(cellNode);
        textarea.readOnly = !this.view?.editable;
        textarea.placeholder = "Empty";

        const autoResize = () => {
          textarea.style.height = "auto";
          textarea.style.height = `${textarea.scrollHeight}px`;
        };
        textarea.addEventListener("input", () => {
          autoResize();
          this.updateCellFromCardInput(r, c, textarea.value);
        });

        field.appendChild(textarea);
        fields.appendChild(field);
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(autoResize);
        }
      }

      card.appendChild(fields);
      list.appendChild(card);
    }

    container.appendChild(list);
  }

  private syncNodeState(node: PMNode) {
    const colCount = getTableColumnCount(node);
    this.cellMinWidth = getEffectiveCellMinWidth(node, 64);

    this.dom.setAttribute("data-col-count", String(colCount));
    if (colCount >= WIDE_TABLE_COL_THRESHOLD) {
      this.dom.setAttribute("data-wide-table", "true");
    } else {
      this.dom.removeAttribute("data-wide-table");
    }
    if (colCount >= BREAKOUT_TABLE_COL_THRESHOLD) {
      this.dom.setAttribute("data-breakout-table", "true");
    } else {
      this.dom.removeAttribute("data-breakout-table");
    }

    if (node.attrs?.freezeFirstCol) {
      this.dom.setAttribute("data-freeze-first-col", "true");
    } else {
      this.dom.removeAttribute("data-freeze-first-col");
    }

    const cellMode: TableCellMode =
      node.attrs?.cellMode === "truncate" ? "truncate" : "wrap";
    this.dom.setAttribute("data-cell-mode", cellMode);

    const viewMode: TableViewMode =
      node.attrs?.viewMode === "cards" ? "cards" : "table";
    this.dom.setAttribute("data-view-mode", viewMode);

    if (viewMode === "cards") {
      this.renderRowCards(node);
    }
  }

  update(node: PMNode): boolean {
    if (!node.sameMarkup(this.node)) return false;
    this.node = node;
    this.cellMinWidth = getEffectiveCellMinWidth(node, 64);
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth);
    this.syncNodeState(node);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => this.syncScrollFades());
    }
    return true;
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    const target = mutation.target;
    if (this.cardsContainer.contains(target)) return true;
    return super.ignoreMutation(mutation);
  }

  destroy() {
    this.scrollWrap.removeEventListener("scroll", this.onScrollBound);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
}

export const KansoTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      freezeFirstCol: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-freeze-first-col") === "true",
        renderHTML: (attrs) =>
          attrs.freezeFirstCol ? { "data-freeze-first-col": "true" } : {},
      },
      cellMode: {
        default: "wrap" as TableCellMode,
        parseHTML: (el) =>
          el.getAttribute("data-cell-mode") === "truncate"
            ? "truncate"
            : "wrap",
        renderHTML: (attrs) =>
          attrs.cellMode === "truncate"
            ? { "data-cell-mode": "truncate" }
            : {},
      },
      viewMode: {
        default: "table" as TableViewMode,
        parseHTML: (el) =>
          el.getAttribute("data-view-mode") === "cards" ? "cards" : "table",
        renderHTML: (attrs) =>
          attrs.viewMode === "cards" ? { "data-view-mode": "cards" } : {},
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const result = this.parent?.({ node, HTMLAttributes });
    return result ?? ["table", mergeAttributes(HTMLAttributes), ["tbody", 0]];
  },
});
