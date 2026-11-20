window.__ModuleLoader__.load({
  id: 'dsh-pin-top',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'pin-top';
    /** Prefix of the sidebar row id / main panel key that opens one pinned Session. */
    const ROW_PREFIX = 'pin-session:';
    /** Host route owned by this bundle's Host half. */
    const LABELS_ROUTE = '/pin-top/labels';
    /** Style tag identity, so a reload keeps one stylesheet. */
    const STYLE_ID = 'dsh-pin-top/styles';
    /** Key prefix of the swatches this plugin contributes to `contextMenu.icon`. */
    const ICON_PREFIX = 'pin-top.label.';
    /** Swatch shown for "no label" and by the submenu's own row. */
    const NO_LABEL_ICON = ICON_PREFIX + 'none';

    /**
     * The one surface this plugin injects rather than registers: the Workspace
     * header has no Slot, so its bulk controls are plain DOM parked beside the
     * shipped action cluster. Everything they do is done by activating the
     * shipped group rows, so no expansion state is duplicated here.
     */
    const BULK_ATTR = 'data-pintop-bulk';
    const HEADER_SELECTOR = '[data-sidebar-workspace-header]';
    const ACTIONS_SELECTOR = '[class*="headerActions"]';
    const GROUP_ROW_SELECTOR = '[data-row-key^="workspace:"][aria-expanded]';
    /** The selected Session row: the browser marks it `aria-selected`. */
    const CURRENT_ROW_SELECTOR = '[data-row-key^="session:"][aria-selected="true"]';
    /** Transient mark that flashes the row a locate landed on. */
    const LOCATED_ATTR = 'data-pintop-located';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    /** Row markers: this plugin's row, its Session, its label, its unpin action. */
    const ROW_ATTR = 'data-pintop-row';
    const SESSION_ATTR = 'data-pintop-session';
    const LABEL_ATTR = 'data-pintop-label';
    const UNPIN_ATTR = 'data-pintop-unpin';

    /**
     * The macOS label palette: seven system colours with the light and the dark
     * variant, so a swatch keeps the same weight in both themes. `key` names the
     * locale entry; `id` is what the Host stores and what a row carries.
     */
    const COLORS = [
      { id: 'red', key: 'color.red', light: '#FF3B30', dark: '#FF453A' },
      { id: 'orange', key: 'color.orange', light: '#FF9500', dark: '#FF9F0A' },
      { id: 'yellow', key: 'color.yellow', light: '#FFCC00', dark: '#FFD60A' },
      { id: 'green', key: 'color.green', light: '#34C759', dark: '#30D158' },
      { id: 'blue', key: 'color.blue', light: '#007AFF', dark: '#0A84FF' },
      { id: 'purple', key: 'color.purple', light: '#AF52DE', dark: '#BF5AF2' },
      { id: 'gray', key: 'color.gray', light: '#8E8E93', dark: '#98989D' },
    ];
    const COLOR_IDS = new Set(COLORS.map((color) => color.id));

    /**
     * Tunable look of the pinned section. The sidebar shell renders those rows
     * itself (one line: glyph + label), so the only levers are the shell's own
     * row boxes and text, driven here through this plugin's own markers.
     */
    const TUNING = {
      order: 100,
      menuOrder: 350,
      rowHeight: 32,
      rowPaddingY: 5,
      groupGap: 4,
      tintDark: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)',
      tintDarkHover: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)',
      tintLight: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
      tintLightHover: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent)',
      labelTint: 14,
      labelTintHover: 24,
      glyphGap: 16,
      headerFontSize: 11,
      headerGap: 6,
      controlFontSize: 12,
      rowActionSize: 28,
      dotSize: 8,
      swatchSize: 12,
      maxVisible: 4,
    };

    /** Palette custom properties, one declaration per colour for one theme. */
    const paletteVars = (tone) => COLORS.map((color) => `--pintop-c-${color.id}:${color[tone]}`).join(';');
    /** One label value aliases the palette entry of the same name. */
    const labelVars = COLORS.map((color) => `[${LABEL_ATTR}="${color.id}"]{--pintop-c:var(--pintop-c-${color.id})}`).join('');
    /** A labelled shell row takes that colour's tint, and deepens it under the pointer. */
    const labelTints = COLORS.map((color) => {
      const row = `button[class*="panelRow"]:has([${LABEL_ATTR}="${color.id}"])`;
      return (
        `${row}{--pintop-c:var(--pintop-c-${color.id});background:color-mix(in srgb,var(--pintop-c) ${TUNING.labelTint}%,transparent)}`
        + `${row}:hover{background:color-mix(in srgb,var(--pintop-c) ${TUNING.labelTintHover}%,transparent)}`
      );
    }).join('');

    /** The plugin's whole visual layer: its own marks, all theme-token driven. */
    const CSS = [
      '.pintop-cell{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px}',
      '.pintop-status{display:block;flex:none}',
      '.pintop-status[data-state="ongoing"]{color:var(--dsw-alias-label-tertiary);transform-origin:center;animation:pintop-spin 1.5s linear infinite}',
      '.pintop-status[data-state="done"]{color:var(--dsw-alias-state-success-primary)}',
      '.pintop-status[data-state="warning"]{color:var(--dsw-alias-state-warn-primary)}',
      '.pintop-track{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;opacity:.25}',
      '.pintop-arc{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-dasharray:12 150;animation:pintop-dash 1.5s ease-in-out infinite}',
      '@keyframes pintop-spin{to{transform:rotate(360deg)}}',
      '@keyframes pintop-dash{0%{stroke-dasharray:12 150;stroke-dashoffset:0}50%{stroke-dasharray:24 150;stroke-dashoffset:-6}to{stroke-dasharray:12 150;stroke-dashoffset:0}}',
      '@media (prefers-reduced-motion:reduce){.pintop-status[data-state="ongoing"],.pintop-arc{animation:none}}',
      ':root{--pintop-tint:var(--dsw-alias-bg-layer-2);--pintop-tint-hover:var(--dsw-alias-bg-layer-1)}',
      '@supports (background:color-mix(in srgb,red 10%,transparent)){:root{--pintop-tint:' + TUNING.tintDark + ';--pintop-tint-hover:' + TUNING.tintDarkHover + '}}',
      '@supports (background:color-mix(in srgb,red 10%,transparent)){body:not([data-ds-dark-theme]){--pintop-tint:' + TUNING.tintLight + ';--pintop-tint-hover:' + TUNING.tintLightHover + '}}',
      // The palette itself: light values first, the dark set on the theme body.
      ':root{' + paletteVars('light') + '}',
      'body[data-ds-dark-theme]{' + paletteVars('dark') + '}',
      labelVars,
      // The label dot in a session row, and the same swatch inside a menu.
      // The hairline ring keeps yellow readable on the light sidebar and every
      // colour separated from its own tint.
      '.pintop-dot{display:block;flex:none;width:' + TUNING.dotSize + 'px;height:' + TUNING.dotSize + 'px;border-radius:999px;background:var(--pintop-c);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pintop-c) 55%,var(--dsw-alias-label-primary))}',
      '.pintop-swatch{display:block;width:' + TUNING.swatchSize + 'px;height:' + TUNING.swatchSize + 'px;border-radius:999px;background:var(--pintop-c);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pintop-c) 55%,var(--dsw-alias-label-primary))}',
      '.pintop-swatch[' + LABEL_ATTR + '="none"]{box-sizing:border-box;border:1.5px solid var(--dsw-alias-label-tertiary);background:transparent}',
      // The shell reserves the trailing strip itself (`padding-right: 38px` on a
      // wide panel row) because it parks its own per-entry button there; this
      // plugin's action takes that exact slot instead, one stacking level above.
      'button:has([' + ROW_ATTR + ']){position:relative;min-height:' + TUNING.rowHeight + 'px;padding-top:' + TUNING.rowPaddingY + 'px;padding-bottom:' + TUNING.rowPaddingY + 'px;margin-block-start:' + TUNING.groupGap + 'px;border-radius:var(--dsw-radius-md);background:var(--pintop-tint)}',
      // The shell's own per-entry button would otherwise sit on top of this
      // plugin's action and silently hide the row instead of unpinning: one row
      // gets one affordance.
      'button[class*="panelRow"]:has([' + ROW_ATTR + '],[data-pintop-header],[data-pintop-control])~[class*="panelUnpin"]{display:none}',
      // A labelled row is tinted by its own colour instead of the brand tint.
      labelTints,
      '@supports not (background:color-mix(in srgb,red 10%,transparent)){button[class*="panelRow"]:has([' + LABEL_ATTR + ']){background:var(--pintop-tint)}button[class*="panelRow"]:has([' + LABEL_ATTR + ']):hover{background:var(--pintop-tint-hover)}}',
      // The action wears the row badge's own mark and tone at rest, and says what
      // it does only while the pointer is on it: the pin fades, a slash appears.
      '.pintop-unpin{position:absolute;inset-inline-end:0;top:2px;z-index:2;width:' + TUNING.rowActionSize + 'px;height:' + TUNING.rowActionSize + 'px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-caption);cursor:pointer;transition:background-color .12s ease,color .12s ease}',
      '.pintop-pin{transition:opacity .12s ease}',
      '.pintop-slash{opacity:0;transition:opacity .12s ease}',
      'button:has([' + ROW_ATTR + ']):hover .pintop-pin,button:has([' + ROW_ATTR + ']):focus-within .pintop-pin,.pintop-unpin:hover .pintop-pin{opacity:.28}',
      'button:has([' + ROW_ATTR + ']):hover .pintop-slash,button:has([' + ROW_ATTR + ']):focus-within .pintop-slash,.pintop-unpin:hover .pintop-slash{opacity:1}',
      '.pintop-unpin:hover,.pintop-unpin:focus-visible{background:var(--pintop-tint-hover);color:var(--dsw-alias-label-primary)}',
      '.pintop-unpin:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      'button:has([' + ROW_ATTR + ']):hover{background:var(--pintop-tint-hover)}',
      'button:has([' + ROW_ATTR + ']):hover .pintop-unpin,button:has([' + ROW_ATTR + ']):focus-within .pintop-unpin{color:var(--dsw-alias-label-secondary)}',
      'button:has([data-pintop-state="done"])>span:last-child{font-weight:500}',
      'button:has([data-pintop-header]){min-height:18px;padding-top:0;padding-bottom:2px;margin-block-start:' + TUNING.headerGap + 'px;background:transparent;pointer-events:none;cursor:default}',
      'button:has([data-pintop-header])>span:last-child{font-size:' + TUNING.headerFontSize + 'px;line-height:1.2;color:var(--dsw-alias-label-secondary);letter-spacing:.04em}',
      'button:has([data-pintop-header]):focus-visible{outline:none}',
      'button:has([data-pintop-control]){min-height:22px;padding-top:0;padding-bottom:2px;margin-block-start:2px;background:transparent}',
      'button:has([data-pintop-control])>span:last-child{font-size:' + TUNING.controlFontSize + 'px;line-height:1.3;color:var(--dsw-alias-label-secondary)}',
      'button:has([data-pintop-control]):hover{background:transparent}',
      'button:has([data-pintop-control]):hover>span:last-child{color:var(--dsw-alias-label-primary)}',
      '[data-sidebar-collapsed] button:has([data-pintop-header]),[data-sidebar-collapsed] button:has([data-pintop-control]){display:none}',
      '[data-sidebar-collapsed] button:has([' + ROW_ATTR + ']){margin-block-start:0}',
      // The injected bulk controls sit in the shipped header, so they copy the
      // shipped header buttons' geometry and hide wherever those hide.
      '.pintop-bulk{display:inline-flex;align-items:center;flex:none}',
      '.pintop-bulk-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:28px;padding:0;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .12s ease,color .12s ease}',
      '.pintop-bulk-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.pintop-bulk-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      '[data-sidebar-collapsed] [data-pintop-bulk]{display:none}',
      // Where a locate landed: a transient inner ring on the row itself.
      '[data-pintop-located]{animation:pintop-located 1.2s ease-out}',
      '@keyframes pintop-located{0%{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}70%{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}100%{box-shadow:inset 0 0 0 2px transparent}}',
      '@media (prefers-reduced-motion:reduce){[data-pintop-located]{animation:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}}',
      // An expanded search takes the whole header; the bulk controls stand down.
      '[class*="sectionHeader"]:has([class*="searchExpanded"]) [data-pintop-bulk]{display:none}',
      '[data-sidebar-collapsed] [data-pintop-unpin]{display:none}',
    ].join('');

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'row.untitled': '未命名会话',
      'row.blank': '新会话',
      'row.unpinHint': '取消置顶（不打开会话）',
      'status.ongoing': '运行中',
      'status.approval': '等待确认',
      'status.planReview': '计划待审',
      'status.answer': '等待回答',
      'status.done': '已完成，未读',
      'section.title': '置顶',
      'section.more': '还有 {count} 个置顶…',
      'section.less': '收起',
      'bulk.locate': '定位到当前会话',
      'bulk.locateHint': '展开并滚动到当前会话',
      'bulk.collapse': '全部收起',
      'bulk.expand': '全部展开',
      'bulk.collapseHint': '收起所有工作区的会话',
      'bulk.expandHint': '展开所有工作区的会话',
      'color.red': '红色',
      'color.orange': '橙色',
      'color.yellow': '黄色',
      'color.green': '绿色',
      'color.blue': '蓝色',
      'color.purple': '紫色',
      'color.gray': '灰色',
      'menu.color': '标签颜色',
      'menu.color.clear': '无颜色',
      'menu.color.unavailable': '标签颜色（重启应用后可用）',
      'menu.color.failed': '标签颜色（存储服务未响应）',
      'notify.failed': '标签颜色保存失败',
      'notify.pinFailed': '颜色已保存，但置顶失败',
    };

    /** English dictionary, complete against the zh key set. */
    const en = {
      'row.untitled': 'Untitled session',
      'row.blank': 'New session',
      'row.unpinHint': 'Unpin without opening',
      'status.ongoing': 'Running',
      'status.approval': 'Waiting for approval',
      'status.planReview': 'Plan waiting for review',
      'status.answer': 'Waiting for an answer',
      'status.done': 'Finished, unread',
      'section.title': 'Pinned',
      'section.more': '{count} more pinned…',
      'section.less': 'Show less',
      'bulk.locate': 'Locate current session',
      'bulk.locateHint': 'Reveal and scroll to the current session',
      'bulk.collapse': 'Collapse all',
      'bulk.expand': 'Expand all',
      'bulk.collapseHint': 'Collapse every workspace group',
      'bulk.expandHint': 'Expand every workspace group',
      'color.red': 'Red',
      'color.orange': 'Orange',
      'color.yellow': 'Yellow',
      'color.green': 'Green',
      'color.blue': 'Blue',
      'color.purple': 'Purple',
      'color.gray': 'Gray',
      'menu.color': 'Label color',
      'menu.color.clear': 'No color',
      'menu.color.unavailable': 'Label color (restart the app to enable)',
      'menu.color.failed': 'Label color (the store did not answer)',
      'notify.failed': 'Could not save the label',
      'notify.pinFailed': 'Saved the color, but pinning failed',
    };

    const EMPTY_SNAPSHOT = Object.freeze({
      phase: 'ready',
      items: [],
      ids: [],
      byId: {},
      pinnedSessionIds: [],
      archivedSessionIds: [],
    });

    /**
     * One tiny observable store, the same shape the shell's own stores use, so a
     * component can subscribe through `useSyncExternalStore`.
     */
    function createStore(initial) {
      let snapshot = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        set(next) {
          snapshot = next;
          for (const listener of [...listeners]) listener();
        },
      };
    }

    /** Install the plugin stylesheet once and return its removal. */
    function installStyles() {
      if (typeof document === 'undefined') return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-pin-top';
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }

    /** Read one observable store snapshot, tolerating a missing store. */
    function snapshotOf(store) {
      if (store === undefined || store === null || typeof store.getSnapshot !== 'function') return EMPTY_SNAPSHOT;
      return store.getSnapshot() ?? EMPTY_SNAPSHOT;
    }

    /** Subscribe to one store; a missing store yields a no-op disposer. */
    function subscribeTo(store, listener) {
      if (store === undefined || store === null || typeof store.subscribe !== 'function') return () => {};
      const dispose = store.subscribe(listener);
      return typeof dispose === 'function' ? dispose : () => {};
    }

    /** A stored label value, or empty when it names no colour of the palette. */
    function colorIdOf(value) {
      return typeof value === 'string' && COLOR_IDS.has(value) ? value : '';
    }

    /** The locale key naming one palette entry. */
    function colorKeyOf(colorId) {
      const found = COLORS.find((color) => color.id === colorId);
      return found === undefined ? '' : found.key;
    }

    /**
     * One Session's label as one primitive, so a row re-renders only when its
     * own colour changes instead of on every write to the document.
     */
    function useLabelOf(store, sessionId) {
      const subscribe = React.useMemo(() => (listener) => subscribeTo(store, listener), [store]);
      const read = React.useMemo(() => () => colorIdOf(snapshotOf(store).bySession?.[sessionId]), [store, sessionId]);
      return React.useSyncExternalStore(subscribe, read);
    }

    /** The row label the shipped session list shows: the stored title, localized otherwise. */
    function titleOf(summary, t) {
      if (summary === undefined || summary === null) return t('row.untitled');
      if (summary.blank === true) return t('row.blank');
      const title = typeof summary.title === 'string' ? summary.title.trim() : '';
      return title === '' ? t('row.untitled') : title;
    }

    /**
     * Join the registry-global pin order with the Session store: the entries this
     * plugin owns, in the Host's pin order (most recently pinned first). Archived
     * ids and stale pins are dropped because nothing could open them.
     */
    function derivePinnedEntries(workspaceSnapshot, sessionSnapshot, t) {
      const pinned = Array.isArray(workspaceSnapshot?.pinnedSessionIds) ? workspaceSnapshot.pinnedSessionIds : [];
      const archived = new Set(Array.isArray(workspaceSnapshot?.archivedSessionIds) ? workspaceSnapshot.archivedSessionIds : []);
      const summaries = sessionSnapshot?.byId ?? EMPTY_SNAPSHOT.byId;
      const sessionsReady = (sessionSnapshot?.phase ?? 'ready') === 'ready';
      const entries = [];
      for (const sessionId of pinned) {
        if (archived.has(sessionId)) continue;
        const summary = summaries[sessionId];
        if (summary === undefined && sessionsReady) continue;
        entries.push({ id: sessionId, title: titleOf(summary, t) });
      }
      return entries;
    }

    /**
     * The Session the main view is showing: the shipped browser reads the same
     * local reference count, so both agree on which row is "current".
     */
    function currentSessionId(sessionStore) {
      const byId = snapshotOf(sessionStore).byId ?? {};
      for (const summary of Object.values(byId)) {
        if ((summary?.retainedBy?.mainView ?? 0) > 0) return String(summary.id ?? '');
      }
      return '';
    }

    /** Hook stand-in for a composition without the Session status face. */
    function useIdleSessionStatus() {
      return '';
    }

    /**
     * One Session's live state as one primitive, so the hook's selector stays
     * comparison-stable: a pending interaction outranks work in flight, which
     * outranks an unread completion.
     */
    function sessionStateOf(statuses, sessionId) {
      if (sessionId === '' || statuses === undefined || statuses === null) return '';
      const status = typeof statuses.get === 'function' ? statuses.get(sessionId) : statuses[sessionId];
      if (status === undefined || status === null) return '';
      const pending = status.pendingInteraction;
      if (pending !== undefined && pending !== null) {
        const kind = typeof pending === 'string' ? pending : pending.kind;
        return `warning-${String(kind ?? 'unknown')}`;
      }
      if (status.running === true) return 'ongoing';
      if (status.completionUnread === true) return 'done';
      return '';
    }

    /** The tone the indicator is drawn in; empty means "idle, draw nothing". */
    function stateToneOf(state) {
      if (typeof state !== 'string' || state === '') return '';
      if (state.startsWith('warning-')) return 'warning';
      if (state === 'ongoing' || state === 'done') return state;
      return '';
    }

    /** Localized words for the state, shown as the indicator's tooltip. */
    function stateLabelOf(state, t) {
      if (state === 'warning-approval') return t('status.approval');
      if (state === 'warning-plan-review') return t('status.planReview');
      if (state === 'warning-question') return t('status.answer');
      if (state === 'ongoing') return t('status.ongoing');
      if (state === 'done') return t('status.done');
      return '';
    }

    /** A glyph cell that draws nothing but keeps its text column aligned. */
    function spacerIcon(marker, width) {
      return function SpacerIcon() {
        return h('span', {
          [marker]: '',
          'aria-hidden': 'true',
          style: { display: 'block', width: width + 'px', height: '1px' },
        });
      };
    }

    /**
     * The shipped session list's state indicator, redrawn at the sizes it uses:
     * a ring for work in flight, a filled dot for a pending interaction or an
     * unread completion.
     */
    function StatusGlyph({ tone }) {
      if (tone === 'ongoing') {
        return h(
          'svg',
          {
            className: 'pintop-status',
            'data-state': 'ongoing',
            width: 14,
            height: 14,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'aria-hidden': 'true',
          },
          h('circle', { className: 'pintop-track', cx: 12, cy: 12, r: 9.5 }),
          h('circle', { className: 'pintop-arc', cx: 12, cy: 12, r: 9.5 }),
        );
      }
      return h(
        'svg',
        { className: 'pintop-status', 'data-state': tone, width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': 'true' },
        h('circle', { cx: 5, cy: 5, r: 3, fill: 'currentColor' }),
      );
    }

    /** One label colour as a plain dot; the colour itself comes from the palette. */
    function ColorDot(props) {
      const color = props.color;
      if (color === '') return null;
      return h('span', { className: 'pintop-dot', [LABEL_ATTR]: color, 'aria-hidden': 'true' });
    }

    /**
     * The host's own `pin-fill` glyph (its "regular" weight, 16-unit grid), drawn
     * from the same path data the shipped session rows use, so this plugin's
     * action is the same mark as the badge it undoes. A slash fades in on hover
     * to say what the click does.
     */
    function PinGlyph({ size = 14 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block' },
        },
        h(
          'g',
          { className: 'pintop-pin' },
          h('path', {
            d: 'M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z',
            fill: 'currentColor',
            stroke: 'currentColor',
            strokeWidth: 1,
            strokeLinejoin: 'round',
          }),
          h('path', {
            d: 'M6.05285 9.47511C6.27284 9.16094C6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z',
            fill: 'currentColor',
          }),
        ),
        h('path', {
          className: 'pintop-slash',
          d: 'M3.6 3.6L12.4 12.4',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
      );
    }

    /** The unpin action inside a row, or null when the target is something else. */
    function unpinTargetOf(event) {
      const target = event === null || event === undefined ? undefined : event.target;
      if (target === null || target === undefined || typeof target.closest !== 'function') return null;
      return target.closest(`[${UNPIN_ATTR}]`);
    }

    /**
     * The row's unpin affordance, a pointer target only. Its click is owned by the
     * document-level capture listener (`watchUnpinClicks`), not by React: the shell
     * renders the row as a <button>, so a bubbling handler inside it is fragile and
     * the row's own activation would still run. The listener cancels the event
     * before any React handler sees it, then unpins. Keyboard and screen-reader
     * users use the shipped session row menu, which offers the same command.
     */
    function UnpinAction(props) {
      const label = props.label;
      const run = () => {
        try {
          const pending = props.unpin();
          if (pending !== undefined && pending !== null && typeof pending.catch === 'function') {
            pending.catch((error) => console.error('[pin-top] unpin failed:', error));
          }
        } catch (error) {
          console.error('[pin-top] unpin failed:', error);
        }
      };
      return h(
        'span',
        {
          className: 'pintop-unpin',
          title: label,
          [UNPIN_ATTR]: '',
          [SESSION_ATTR]: props.sessionId,
          onClick: (event) => {
            // Reached only when the capture listener is not installed (a Client
            // run without a document); it still never lets the row open.
            event.preventDefault();
            event.stopPropagation();
            run();
          },
        },
        h(PinGlyph, { size: 14 }),
      );
    }

    /**
     * Own the unpin click before the shell's row button can act on it: capture on
     * the document, cancel the event, then unpin the Session the action named.
     */
    function watchUnpinClicks(unpin) {
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return () => {};
      const onClick = (event) => {
        const action = unpinTargetOf(event);
        if (action === null) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        const sessionId = action.getAttribute(SESSION_ATTR) ?? '';
        if (sessionId === '') return;
        try {
          const pending = unpin(sessionId);
          if (pending !== undefined && pending !== null && typeof pending.catch === 'function') {
            pending.catch((error) => console.error('[pin-top] unpin failed:', error));
          }
        } catch (error) {
          console.error('[pin-top] unpin failed:', error);
        }
      };
      document.addEventListener('click', onClick, true);
      return () => document.removeEventListener('click', onClick, true);
    }

    /**
     * Right-clicking one of this plugin's own pinned rows opens the same menu the
     * shipped session rows use, so the colour a user picks in the tree is one
     * pick away here too. The shell binds that gesture on its own rows; a row
     * this plugin contributes only carries the Session marker.
     */
    function watchRowContextMenus(open) {
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return () => {};
      /**
       * The Session marker sits in the glyph cell, so a right-click on the row's
       * title has to reach it through the row button the shell renders.
       */
      const markerOf = (target) => {
        if (target === null || target === undefined || typeof target.closest !== 'function') return null;
        const direct = target.closest(`[${SESSION_ATTR}]`);
        if (direct !== null && direct !== undefined) return direct;
        const row = target.closest('button');
        if (row === null || row === undefined || typeof row.querySelector !== 'function') return null;
        return row.querySelector(`[${SESSION_ATTR}]`);
      };
      /** Menu point for a row: the pointer's, or the row's edge for a keystroke. */
      const pointOf = (event, marker) => {
        const pointer = typeof event.clientX === 'number' && typeof event.clientY === 'number';
        if (pointer && !(event.clientX === 0 && event.clientY === 0)) return { x: event.clientX, y: event.clientY };
        const rect = typeof marker.getBoundingClientRect === 'function' ? marker.getBoundingClientRect() : undefined;
        return rect !== undefined && typeof rect.bottom === 'number' ? { x: rect.left, y: rect.bottom } : { x: event.clientX ?? 0, y: event.clientY ?? 0 };
      };
      const show = (event, marker) => {
        const sessionId = marker.getAttribute(SESSION_ATTR) ?? '';
        if (sessionId === '') return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        open(sessionId, pointOf(event, marker));
      };
      const onContextMenu = (event) => {
        const marker = markerOf(event === null || event === undefined ? undefined : event.target);
        if (marker !== null) show(event, marker);
      };
      // The shell binds the menu key on its own session rows only; a row this
      // plugin contributed opens the same menu from the keyboard here.
      const onKeyDown = (event) => {
        if (event === null || event === undefined || event.repeat === true) return;
        if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey === true)) return;
        const marker = markerOf(event.target);
        if (marker !== null) show(event, marker);
      };
      document.addEventListener('contextmenu', onContextMenu, true);
      document.addEventListener('keydown', onKeyDown, true);
      return () => {
        document.removeEventListener('contextmenu', onContextMenu, true);
        document.removeEventListener('keydown', onKeyDown, true);
      };
    }

    /**
     * Glyph of one Session row this plugin owns: the host-shaped state indicator
     * (or the label dot while the Session is idle), the row markers the
     * stylesheet keys on, and the unpin hover action.
     */
    function PinnedRowIcon(props) {
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : '';
      const statusHook = typeof props.useSessionStatus === 'function' ? props.useSessionStatus : useIdleSessionStatus;
      const state = statusHook((statuses) => sessionStateOf(statuses, sessionId));
      const color = useLabelOf(props.labelsStore, sessionId);
      try {
        const tone = stateToneOf(state);
        const stateName = tone === '' || typeof props.t !== 'function' ? '' : stateLabelOf(state, props.t);
        const colorName = color === '' || typeof props.t !== 'function' ? '' : props.t(colorKeyOf(color));
        const title = [stateName, colorName].filter((part) => part !== '').join(' · ');
        const unpin = typeof props.unpin !== 'function' ? null : props.unpin;
        const unpinLabel = typeof props.t === 'function' ? props.t('row.unpinHint') : 'Unpin';
        return h(
          'span',
          {
            className: 'pintop-cell',
            [ROW_ATTR]: '',
            'data-pintop-state': tone,
            [LABEL_ATTR]: color === '' ? undefined : color,
            [SESSION_ATTR]: sessionId === '' ? undefined : sessionId,
            title: title === '' ? undefined : title,
          },
          tone === '' ? h(ColorDot, { color }) : h(StatusGlyph, { tone }),
          unpin === null ? null : h(UnpinAction, { unpin, label: unpinLabel, sessionId }),
        );
      } catch (error) {
        console.error('[pin-top] row decoration failed:', error);
        return h('span', {
          className: 'pintop-cell',
          [ROW_ATTR]: '',
          'data-pintop-state': '',
          [SESSION_ATTR]: sessionId === '' ? undefined : sessionId,
        });
      }
    }

    /** Left-aligned section label: no glyph column at all. */
    function HeaderIcon() {
      return h('span', { 'data-pintop-header': '', 'aria-hidden': 'true', style: { display: 'none' } });
    }

    /** Section controls keep the entries' text column. */
    const ControlIcon = spacerIcon('data-pintop-control', TUNING.glyphGap);

    /**
     * The label dot after a shipped session row's time: the colour a user picked
     * in the menu, visible without opening anything.
     */
    function TrailingLabel(props) {
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : '';
      const color = useLabelOf(props.labelsStore, sessionId);
      if (color === '') return null;
      // Decorative: the row's own label is its accessible name, and the shipped
      // resting cell is hidden while the row is hovered, so a tooltip here would
      // have no moment to appear.
      return h('span', { className: 'pintop-dot', [LABEL_ATTR]: color, 'aria-hidden': 'true' });
    }

    /**
     * One swatch inside the shared menu. The key it was registered under names
     * the colour, so all eight icons share this one component.
     */
    function ColorSwatch(props) {
      const key = typeof props.icon?.key === 'string' ? props.icon.key : '';
      const color = key.startsWith(ICON_PREFIX) ? key.slice(ICON_PREFIX.length) : '';
      return h('span', { className: 'pintop-swatch', [LABEL_ATTR]: COLOR_IDS.has(color) ? color : 'none', 'aria-hidden': 'true' });
    }

    /**
     * Open or close every Workspace group by activating the shipped group rows.
     * The rows own the state (`aria-expanded` mirrors it), so this repeats their
     * own gesture instead of writing a parallel copy of it — and the browser's
     * persisted view state follows exactly as if the user had clicked each one.
     * Tree mode only mounts a nested group once its parent opens, so one pass
     * re-runs while it discovers rows it has not touched yet.
     */
    let bulkGeneration = 0;
    function bulkSetExpanded(expanded) {
      if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return 0;
      const touched = new Set();
      // A newer command supersedes the follow-up passes of an older one, so
      // clicking Expand and then Collapse cannot end up re-expanding groups.
      const generation = ++bulkGeneration;
      let passes = 0;
      let changed = 0;
      const pass = () => {
        passes += 1;
        let fresh = 0;
        for (const row of document.querySelectorAll(GROUP_ROW_SELECTOR)) {
          const key = typeof row.getAttribute === 'function' ? row.getAttribute('data-row-key') : null;
          const id = key ?? '';
          if (touched.has(id)) continue;
          touched.add(id);
          if ((row.getAttribute('aria-expanded') === 'true') === expanded) continue;
          if (typeof row.click !== 'function') continue;
          row.click();
          fresh += 1;
        }
        changed += fresh;
        if (fresh > 0 && passes < 6 && generation === bulkGeneration) setTimeout(pass, 0);
      };
      pass();
      return changed;
    }

    /** Scroll one row into view and flash it, so the eye can find where it landed. */
    function flashRow(row) {
      if (row === null || row === undefined) return false;
      if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
      if (typeof row.setAttribute !== 'function') return true;
      row.setAttribute(LOCATED_ATTR, '');
      // The mark is transient: it must never linger as a second "selected" look.
      setTimeout(() => {
        if (typeof row.removeAttribute === 'function') row.removeAttribute(LOCATED_ATTR);
      }, 1200);
      return true;
    }

    /**
     * Bring the current Session back into view: open whatever hides it and scroll
     * to its row. Nothing is selected or opened — this is the tree's "locate",
     * not a navigation. Ancestors are opened by path prefix, which is exactly how
     * the tree nests workspaces, and every open is the shipped row's own toggle.
     */
    function locateCurrent(sessionId, workspaceSnapshot) {
      if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
      const query = () => document.querySelector(CURRENT_ROW_SELECTOR);
      const visible = query();
      if (visible !== null) {
        flashRow(visible);
        return;
      }
      // The row is not mounted: open the groups that can contain it, cheapest
      // first — its own ancestor chain, then (once) every closed group.
      const items = Array.isArray(workspaceSnapshot?.items) ? workspaceSnapshot.items : [];
      const owner = sessionId === ''
        ? undefined
        : items.find((item) => Array.isArray(item?.sessionIds) && item.sessionIds.includes(sessionId));
      const chain = owner === undefined
        ? []
        : items
          .filter((item) => item.path === owner.path
            || (String(owner.path ?? '') !== '' && String(item.path ?? '') !== '' && String(owner.path).startsWith(String(item.path) + '/')))
          .sort((left, right) => String(left.path ?? '').length - String(right.path ?? '').length);
      const openGroup = (workspaceId) => {
        const rows = document.querySelectorAll(GROUP_ROW_SELECTOR);
        for (const row of rows) {
          if (row.getAttribute('data-row-key') !== 'workspace:' + String(workspaceId)) continue;
          if (row.getAttribute('aria-expanded') !== 'false') return false;
          row.click();
          return true;
        }
        return false;
      };
      let opened = 0;
      for (const item of chain) if (openGroup(item.workspaceId)) opened += 1;
      let fallbackUsed = false;
      const round = (attempt) => {
        const row = query();
        if (row !== null) {
          flashRow(row);
          return;
        }
        if (attempt < 3) {
          // Opening a parent mounts the child rows on the next commit.
          setTimeout(() => round(attempt + 1), 0);
          return;
        }
        if (fallbackUsed) return;
        fallbackUsed = true;
        // A layout this cannot model (an ungrouped bucket, a stale path): open
        // what is still closed, once, and look again.
        for (const candidate of document.querySelectorAll(GROUP_ROW_SELECTOR)) {
          if (candidate.getAttribute('aria-expanded') === 'false') candidate.click();
        }
        setTimeout(() => round(0), 0);
      };
      round(0);
    }

    /** Add one finished SVG child to a glyph. */
    function glyphPart(svg, tag, attributes) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
      svg.appendChild(node);
      return node;
    }

    /**
     * The three header glyphs, drawn in the IDE's vocabulary on the host's 16-unit
     * grid: a target for "locate", and the paired bars-and-arrows marks for
     * "collapse all" (arrows pointing in) and "expand all" (arrows pointing out).
     */
    function bulkGlyph(kind) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const fill = { fill: 'currentColor', stroke: 'none' };
      if (kind === 'locate') {
        glyphPart(svg, 'circle', { cx: 8, cy: 8, r: 5.5, 'stroke-width': 1.2 });
        glyphPart(svg, 'path', { d: 'M8 2.5V5.4', 'stroke-width': 1.2, 'stroke-linecap': 'round' });
        glyphPart(svg, 'path', { d: 'M8 10.6V13.5', 'stroke-width': 1.2, 'stroke-linecap': 'round' });
        glyphPart(svg, 'path', { d: 'M2.5 8H5.4', 'stroke-width': 1.2, 'stroke-linecap': 'round' });
        glyphPart(svg, 'path', { d: 'M10.6 8H13.5', 'stroke-width': 1.2, 'stroke-linecap': 'round' });
        return svg;
      }
      if (kind === 'collapse') {
        glyphPart(svg, 'rect', { x: 3.2, y: 2.2, width: 9.6, height: 1.5, rx: 0.6, ...fill });
        glyphPart(svg, 'rect', { x: 3.2, y: 12.3, width: 9.6, height: 1.5, rx: 0.6, ...fill });
        glyphPart(svg, 'path', { d: 'M5.7 5.1H10.3L8 7.15Z', ...fill });
        glyphPart(svg, 'path', { d: 'M5.7 10.9H10.3L8 8.85Z', ...fill });
        return svg;
      }
      glyphPart(svg, 'rect', { x: 3.2, y: 7.25, width: 9.6, height: 1.5, rx: 0.6, ...fill });
      glyphPart(svg, 'path', { d: 'M5.7 4.9H10.3L8 2.85Z', ...fill });
      glyphPart(svg, 'path', { d: 'M5.7 11.1H10.3L8 13.15Z', ...fill });
      return svg;
    }

    /**
     * Park the two bulk controls immediately left of the shipped header action
     * cluster, and keep them there. The cluster is React-owned, so the container
     * is inserted as its sibling and re-asserted only when that sibling link
     * breaks; nothing shipped is ever removed, moved or re-styled.
     */
    function mountBulkControls(t, locate) {
      const body = typeof document === 'undefined' ? undefined : document.body;
      if (body === undefined || body === null || typeof document.createElement !== 'function') return () => {};
      let container = null;
      let actions = null;
      let disposed = false;
      const build = () => {
        const wrap = document.createElement('span');
        wrap.className = 'pintop-bulk';
        wrap.setAttribute(BULK_ATTR, '');
        for (const kind of ['locate', 'collapse', 'expand']) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'pintop-bulk-btn';
          button.setAttribute(BULK_ATTR + '-' + kind, '');
          button.setAttribute('aria-label', t('bulk.' + kind));
          button.setAttribute('title', t('bulk.' + kind + 'Hint'));
          button.appendChild(bulkGlyph(kind));
          button.addEventListener('click', (event) => {
            // The header's own controls are inside no interactive parent, but a
            // stray activation must never reach the browsing region either.
            event.preventDefault();
            event.stopPropagation();
            if (kind === 'locate') locate();
            else bulkSetExpanded(kind === 'expand');
          });
          wrap.appendChild(button);
        }
        return wrap;
      };
      const ensure = () => {
        if (disposed) return;
        const header = typeof document.querySelector === 'function' ? document.querySelector(HEADER_SELECTOR) : null;
        if (header === null || header === undefined) {
          actions = null;
          return;
        }
        const cluster = typeof header.querySelector === 'function' ? header.querySelector(ACTIONS_SELECTOR) : null;
        if (cluster === null || cluster === undefined || cluster.parentElement !== header) {
          actions = null;
          return;
        }
        actions = cluster;
        if (container === null || container.isConnected !== true) {
          // Adopt an orphan this plugin left behind (a reload whose cleanup did
          // not run) instead of stacking a second copy into the same header.
          const orphan = typeof header.querySelector === 'function' ? header.querySelector('[' + BULK_ATTR + ']') : null;
          container = orphan !== null && orphan !== undefined ? orphan : build();
        }
        if (container.parentElement !== header || container.nextElementSibling !== actions) {
          header.insertBefore(container, actions);
        }
      };
      ensure();
      let observer = null;
      if (typeof MutationObserver === 'function') {
        observer = new MutationObserver(() => {
          // O(1) while everything is in place: React only ever appends or
          // removes its own children, so this link survives normal updates.
          if (container !== null && container.isConnected === true && container.nextElementSibling === actions) return;
          ensure();
        });
        observer.observe(body, { childList: true, subtree: true });
      }
      return () => {
        disposed = true;
        if (observer !== null) observer.disconnect();
        if (container !== null && typeof container.remove === 'function') container.remove();
        container = null;
        actions = null;
      };
    }

    /**
     * Bridge from a sidebar row to its effect: the shell activates a panel row by
     * selecting its `main` key, so this panel runs the row's command and clears
     * the panel again in the same commit.
     */
    function PanelCommandBridge(props) {
      const useLayout = typeof React.useLayoutEffect === 'function' ? React.useLayoutEffect : React.useEffect;
      useLayout(() => {
        try {
          if (typeof props.run === 'function') props.run();
        } catch (error) {
          console.error('[pin-top] sidebar row command failed:', error);
        } finally {
          props.leavePanel();
        }
      }, []);
      return null;
    }

    /**
     * The colour actions of one Session: a submenu of the palette plus "no
     * colour", each row carrying its own swatch and, for the current colour, a
     * leading check. When the Host half is not answering (a restart is pending),
     * one disabled row says so instead of pretending to work.
     */
    function labelMenuActions(target, labels, t, pick) {
      if (labels.available === false) {
        const reason = labels.routeMissing === true ? t('menu.color.unavailable') : t('menu.color.failed');
        return [{ id: 'label-color', label: reason, icon: { key: NO_LABEL_ICON }, disabled: true }];
      }
      const sessionId = target.sessionId;
      const current = colorIdOf(labels.bySession?.[sessionId]);
      const failure = t('notify.failed');
      // Removing a colour is the common move, so it leads the submenu and the
      // palette follows it behind one separator.
      const children = [{
        id: 'label:clear',
        label: t('menu.color.clear'),
        icon: { key: NO_LABEL_ICON },
        disabled: current === '',
        failureLabel: failure,
        run: () => pick(sessionId, null),
      }];
      for (const color of COLORS) {
        children.push({
          id: 'label:' + color.id,
          label: (current === color.id ? '✓ ' : '') + t(color.key),
          icon: { key: ICON_PREFIX + color.id },
          separatorBefore: color === COLORS[0],
          failureLabel: failure,
          run: () => pick(sessionId, color.id),
        });
      }
      return [{ id: 'label-color', label: t('menu.color'), icon: { key: NO_LABEL_ICON }, children }];
    }

    /**
     * Only the two services every web composition provides are hard dependencies.
     * Everything else is resolved defensively so a missing face degrades this
     * add-on to a no-op instead of keeping the plugin entry pending.
     */
    const inject = ['slots', 'locale'];

    /** Register every surface this plugin owns. */
    function register(ctx) {
      ctx.effect(() => installStyles(), 'pin-top: stylesheet');
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pin-top: dictionaries');
      const t = ctx.locale.bind(NS);
      ctx.effect(
        () => mountBulkControls(t, () => locateCurrent(currentSessionId(sessionStore), snapshotOf(workspaceStore))),
        'pin-top: bulk controls',
      );
      const workspacesService = ctx.get('workspaces');
      const sessionsService = ctx.get('sessions');
      const workspaceStore = workspacesService === undefined ? undefined : workspacesService.list;
      const sessionStore = sessionsService === undefined ? undefined : sessionsService.list;

      // Label state: the Host document mirrored into one observable. Responses
      // are published only by the newest request, so a slow read cannot overwrite
      // the write the user just made.
      const labelsStore = createStore({ phase: 'loading', bySession: {}, available: true });
      let labelTicket = 0;
      const publishLabels = (value) => labelsStore.set({ phase: 'ready', bySession: value?.bySession ?? {}, available: true });
      /** One request; the caller holds the ticket that decides who publishes. */
      const request = async (init, ticket) => {
        const response = await fetch(LABELS_ROUTE, init);
        if (!response.ok) {
          // A missing route means this Client is newer than the running Host
          // half; anything else is a failing service. The menu says which.
          throw Object.assign(new Error('HTTP ' + String(response.status)), { routeMissing: response.status === 404 });
        }
        const payload = await response.json();
        if (payload === null || typeof payload !== 'object' || payload.ok !== true) throw new Error('label request failed');
        return { ticket, value: payload.value ?? { bySession: {} } };
      };
      const loadLabels = () => {
        const ticket = ++labelTicket;
        request({ method: 'GET', headers: { accept: 'application/json' } }, ticket)
          .then(({ value }) => {
            if (ticket === labelTicket) publishLabels(value);
          })
          .catch((error) => {
            console.warn('[pin-top] label service unavailable:', error);
            if (ticket === labelTicket) {
              labelsStore.set({ phase: 'ready', bySession: {}, available: false, routeMissing: error?.routeMissing === true });
            }
          });
      };
      const saveLabel = (sessionId, color) => {
        const ticket = ++labelTicket;
        return request(
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, color }),
          },
          ticket,
        ).then(({ value }) => {
          if (ticket === labelTicket) publishLabels(value);
          return value;
        });
      };

      const openSession = (sessionId) => {
        const navigation = ctx.get('uiWorkspace');
        if (navigation !== undefined && typeof navigation.openSession === 'function') {
          navigation.openSession(sessionId);
          return;
        }
        throw new Error('pin-top: workspace navigation is unavailable');
      };

      const unpinSession = (sessionId) => {
        const navigation = ctx.get('uiWorkspace');
        if (navigation !== undefined && typeof navigation.unpinSession === 'function') return navigation.unpinSession(sessionId);
        const workspaces = ctx.get('workspaces');
        if (workspaces !== undefined && typeof workspaces.unpinSession === 'function') return workspaces.unpinSession(sessionId);
        throw new Error('pin-top: the workspace controller cannot unpin');
      };

      /** Show one localized notice through the shared menu service, when present. */
      const notify = (text) => {
        const menus = ctx.get('contextMenus');
        if (menus === undefined || typeof menus.notify !== 'function') return;
        try {
          menus.notify(text);
        } catch (error) {
          console.error('[pin-top] notice failed:', error);
        }
      };

      /**
       * A labelled Session leads its section: the colour also pins it, which is
       * what puts it on top of the shipped tree. The colour is already saved by
       * the time this runs, so a failed pin is reported instead of losing both.
       */
      const pinning = new Set();
      const ensurePinned = (sessionId) => {
        const pinned = snapshotOf(workspaceStore).pinnedSessionIds;
        if (Array.isArray(pinned) && pinned.includes(sessionId)) return;
        // The pin write is a round trip, so the snapshot above lags; one write
        // per session is enough while it is in flight.
        if (pinning.has(sessionId)) return;
        const navigation = ctx.get('uiWorkspace');
        if (navigation === undefined || typeof navigation.pinSession !== 'function') return;
        pinning.add(sessionId);
        const settle = () => pinning.delete(sessionId);
        try {
          const pending = navigation.pinSession(sessionId);
          if (pending !== undefined && pending !== null && typeof pending.catch === 'function') {
            pending.then(settle, (error) => {
              settle();
              console.error('[pin-top] pin failed:', error);
              notify(t('notify.pinFailed'));
            });
          } else {
            settle();
          }
        } catch (error) {
          settle();
          console.error('[pin-top] pin failed:', error);
          notify(t('notify.pinFailed'));
        }
      };

      /** Store one colour (or clear it) and, for a colour, pin the Session. */
      const pickColor = (sessionId, color) =>
        saveLabel(sessionId, color).then(() => {
          if (color !== null) ensurePinned(sessionId);
        });

      /** Open the shared session menu for one of this plugin's own rows. */
      const openSharedMenu = (sessionId, point) => {
        const menus = ctx.get('contextMenus');
        if (menus === undefined || typeof menus.open !== 'function') return;
        const summary = snapshotOf(sessionStore).byId?.[sessionId];
        const displayTitle = typeof summary?.title === 'string' ? summary.title : '';
        try {
          menus.open({ kind: 'session', value: { sessionId, displayTitle } }, point);
        } catch (error) {
          console.error('[pin-top] opening the session menu failed:', error);
        }
      };

      // Owned by this Client run: a capture listener that cancels the row's own
      // activation before the shell can open the Session.
      ctx.effect(() => watchUnpinClicks(unpinSession), 'pin-top: unpin clicks');

      const leavePanel = () => {
        const layout = ctx.get('layout');
        if (layout !== undefined && typeof layout.selectPanel === 'function') layout.selectPanel(null);
      };

      /** One registration attempt: a failure is reported, never thrown. */
      const tryRegister = (label, options, component) => {
        try {
          return ctx.slots.register(options, component);
        } catch (error) {
          console.error(`[pin-top] ${label} failed:`, error);
          return null;
        }
      };

      // The section is rebuilt from one plan: a section label, one row per
      // visible pinned Session, then the collapse controls. Only a changed
      // signature rebuilds, and only a fully registered plan replaces the last.
      let expanded = false;
      let signature = null;
      let disposing = 0;
      const owned = new Set();
      // Our own disposals emit `slots/changed`; those must not be mistaken for a
      // slot declaration and requeue a plan that keeps failing to register.
      const disposeOwned = () => {
        disposing += 1;
        try {
          for (const dispose of owned) dispose();
        } finally {
          disposing -= 1;
          owned.clear();
        }
      };

      const buildPlan = (pinned) => {
        const limit = Math.max(1, TUNING.maxVisible);
        const collapsible = pinned.length > limit;
        const visible = collapsible && !expanded ? pinned.slice(0, limit) : pinned;
        const hidden = pinned.length - visible.length;
        const plan = [];
        if (pinned.length > 0) {
          plan.push({ id: 'pin-top-header', order: TUNING.order - 1, label: () => t('section.title'), icon: HeaderIcon, run: undefined });
        }
        for (const [index, entry] of visible.entries()) {
          plan.push({
            id: ROW_PREFIX + entry.id,
            order: TUNING.order + index,
            label: () => entry.title,
            icon: PinnedRowIcon,
            inject: () => ({ sessionId: entry.id, labelsStore, unpin: () => unpinSession(entry.id) }),
            run: () => openSession(entry.id),
          });
        }
        if (hidden > 0) {
          plan.push({
            id: 'pin-top-more',
            order: TUNING.order + visible.length,
            label: () => t('section.more', { count: hidden }),
            icon: ControlIcon,
            run: () => {
              expanded = true;
              queueMicrotask(syncRows);
            },
          });
        }
        if (collapsible && expanded) {
          plan.push({
            id: 'pin-top-less',
            order: TUNING.order + visible.length,
            label: () => t('section.less'),
            icon: ControlIcon,
            run: () => {
              expanded = false;
              queueMicrotask(syncRows);
            },
          });
        }
        return plan;
      };

      let rebuilding = false;
      let pendingRebuild = false;
      const syncRows = () => {
        // Disposing a registration emits `slots/changed`, which calls back into
        // this function: without the guard the rebuilt plan would be registered
        // twice and every id would collide.
        if (rebuilding) {
          pendingRebuild = true;
          return;
        }
        let pinned;
        try {
          pinned = derivePinnedEntries(snapshotOf(workspaceStore), snapshotOf(sessionStore), t);
        } catch (error) {
          console.error('[pin-top] reading sidebar data failed:', error);
          return;
        }
        const plan = buildPlan(pinned);
        const next = plan.map((row) => `${row.id}\u0000${row.label()}`).join('\u0001');
        if (next === signature) return;
        rebuilding = true;
        // Adopt the signature before disposing: the disposal itself fires the
        // `slots/changed` that would otherwise start a second build.
        signature = next;
        try {
          disposeOwned();
          const made = [];
          for (const row of plan) {
            const disposeRow = tryRegister(
              'pinned section row registration',
              {
                name: 'sidebar.panellist',
                id: row.id,
                order: row.order,
                locale: NS,
                label: row.label,
                ...(row.inject === undefined ? {} : { inject: row.inject }),
              },
              row.icon,
            );
            const disposeBridge = tryRegister(
              'pinned section bridge registration',
              { name: 'main', key: row.id, inject: () => ({ run: row.run, leavePanel }) },
              PanelCommandBridge,
            );
            if (disposeRow === null || disposeBridge === null) {
              disposing += 1;
              try {
                if (disposeRow !== null) disposeRow();
                if (disposeBridge !== null) disposeBridge();
                for (const undo of made) undo();
              } finally {
                disposing -= 1;
              }
              signature = null;
              return;
            }
            made.push(() => {
              disposeBridge();
              disposeRow();
            });
          }
          for (const dispose of made) owned.add(dispose);
        } finally {
          rebuilding = false;
          if (pendingRebuild) {
            pendingRebuild = false;
            queueMicrotask(syncRows);
          }
        }
      };

      ctx.effect(() => {
        const onSlotsChanged = () => {
          if (disposing === 0) syncRows();
        };
        const disposers = [
          subscribeTo(workspaceStore, syncRows),
          subscribeTo(sessionStore, syncRows),
          ctx.on('slots/changed', onSlotsChanged),
          // A dropped connection is the moment to ask the Host half again: one
          // failed read at activation must not hide labels until a reload.
          ctx.on('connection/reset', loadLabels),
        ];
        loadLabels();
        syncRows();
        return () => {
          for (const dispose of disposers) dispose();
          disposeOwned();
        };
      }, 'pin-top: pinned sidebar section');

      // The colour dot after a shipped Session row's time: ambient decoration,
      // never a second way to open or select the row.
      ctx.slots.inject('sidebar.session.row.trailing', () =>
        tryRegister(
          'session label dot registration',
          { name: 'sidebar.session.row.trailing', id: 'pin-top-label-dot', order: 20, inject: () => ({ labelsStore }) },
          TrailingLabel,
        ) ?? (() => {}),
      );

      // The shared menu: one submenu of colours per Session, the swatches those
      // rows draw, and the same menu on this plugin's own pinned rows.
      ctx.inject(['contextMenus'], (scoped) => {
        scoped.effect(() => {
          const dispose = scoped.contextMenus.register({
            id: 'pin-top.labels',
            target: 'session',
            order: TUNING.menuOrder,
            observe: () => [labelsStore, ctx.locale],
            resolve: (target) => {
              try {
                return labelMenuActions(target, labelsStore.getSnapshot(), t, pickColor);
              } catch (error) {
                console.error('[pin-top] building the label menu failed:', error);
                return [];
              }
            },
          });
          return typeof dispose === 'function' ? dispose : () => {};
        }, 'pin-top: session label menu');

        scoped.effect(() => watchRowContextMenus(openSharedMenu), 'pin-top: pinned row menus');

        // The slot is declared by the menu owner, so wait for it; the effect
        // makes one scoped lifetime own exactly one set of swatches.
        scoped.effect(
          () =>
            ctx.slots.inject('contextMenu.icon', () => {
              const disposers = [];
              for (const key of [...COLORS.map((color) => ICON_PREFIX + color.id), NO_LABEL_ICON]) {
                try {
                  const dispose = ctx.slots.register({ name: 'contextMenu.icon', key }, ColorSwatch);
                  if (typeof dispose === 'function') disposers.push(dispose);
                } catch (error) {
                  console.error('[pin-top] label swatch registration failed:', error);
                }
              }
              return () => {
                for (const dispose of disposers) dispose();
              };
            }),
          'pin-top: label swatches',
        );
      });
    }

    /**
     * Activation guard: a failed entry aborts the whole web boot ("entries did
     * not activate"), so this optional add-on reports its own failure and stays
     * inactive instead of taking the application down with it.
     */
    function apply(ctx) {
      try {
        register(ctx);
      } catch (error) {
        console.error('[pin-top] activation failed:', error);
      }
    }

    return { inject, NS, apply, COLORS, bulkSetExpanded, currentSessionId, locateCurrent };
  },
});
