window.__ModuleLoader__.load({
  id: '@hewhenjay/dsh-provider-hub',
  factory: (require) => {
    const module = { exports: {} };
    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const {
      Button, Input, Menu, Modal, Pill, StateDot,
      IconApiOutline14, IconPlusOutline16, IconRefreshOutline16,
      IconTrashOutline16, IconPlayOutline16, IconPauseOutline16,
      IconChevronDownOutline14, IconGlobeOutline14, IconLinkOutline16,
      IconCheckOutline16, IconLoadingOutline16, IconBranchOutline16
    } = require('@deepseek-ai/dsh-client-ui-primitives');

    let dshApi;

    // Lucide "Network" (ISC): https://lucide.dev/icons/network
    function ProviderHubIcon({ size = 16, className }) {
      return React.createElement('svg', { width: size, height: size, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        React.createElement('rect', { x: 16, y: 16, width: 6, height: 6, rx: 1 }),
        React.createElement('rect', { x: 2, y: 16, width: 6, height: 6, rx: 1 }),
        React.createElement('rect', { x: 9, y: 2, width: 6, height: 6, rx: 1 }),
        React.createElement('path', { d: 'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3' }),
        React.createElement('path', { d: 'M12 12V8' })
      );
    }

    const css = `
      [data-pane='conversation'],[class*='centerCol']{position:relative}[data-dsh-provider-hub-view]{position:absolute;inset:0;z-index:70;display:none;overflow:auto;background:var(--dsw-alias-bg-base)}html[data-dsh-provider-hub-active] [data-dsh-provider-hub-view]{display:block}html[data-dsh-provider-hub-active] [data-pane='conversation']>:not([data-dsh-provider-hub-view]),html[data-dsh-provider-hub-active] [class*='centerCol']>:not([data-dsh-provider-hub-view]){display:none!important}.ph-workspace{min-height:100%;padding:22px clamp(16px,3vw,34px);box-sizing:border-box;background:var(--dsw-alias-bg-base)}.ph-workspaceInner{width:min(1180px,100%);margin:0 auto}.ph-workspaceBar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.ph-workspaceBrand{display:flex;align-items:center;gap:12px}.ph-workspaceBrand h1{margin:0;font-size:20px}.ph-workspaceBrand p{margin:3px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px}.ph-workspaceMark{width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}.ph-entry{width:100%;height:32px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:8px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}.ph-entry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}.ph-entry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}.ph-entryIcon{width:16px;height:16px;display:inline-flex;flex:none}.ph-entryIcon svg{width:16px;height:16px}[data-dsh-frame][data-sidebar-collapsed] .ph-entry{justify-content:center;padding:0}[data-dsh-frame][data-sidebar-collapsed] .ph-entryLabel{display:none}.ph-trigger:focus-visible,.ph-tab:focus-visible,.ph-selectTrigger:focus-visible,.ph-check:focus-within{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.ph-dashboard{display:flex;flex-direction:column;gap:18px;min-width:0;color:var(--dsw-alias-label-primary)}.ph-modal{width:min(980px,calc(100vw - 32px));max-width:980px}.ph-modalBody{max-height:min(74vh,820px);overflow:auto}.ph-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}.ph-title{font-size:16px;font-weight:650;margin:0 0 5px}.ph-sub{font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.55}.ph-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ph-danger{color:var(--dsw-alias-state-error-primary)!important}.ph-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2)}.ph-tab{border:0;background:none;color:var(--dsw-alias-label-secondary);padding:9px 12px;cursor:pointer;border-bottom:2px solid transparent;font:inherit}.ph-tab[data-active=true]{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}.ph-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ph-card{padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}.ph-cardHead{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.ph-cardName{font-weight:600}.ph-meta{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:6px;line-height:1.5;overflow-wrap:anywhere}.ph-models{display:flex;gap:5px;flex-wrap:wrap;margin:12px 0}.ph-model{font-size:11px;padding:3px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}.ph-rowActions{display:flex;gap:4px;justify-content:flex-end;margin-top:10px}.ph-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ph-field{display:flex;flex-direction:column;gap:6px;min-width:0}.ph-wide{grid-column:1/-1}.ph-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}.ph-hint,.ph-help{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5}.ph-control{width:100%}.ph-textarea,.ph-selectTrigger{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit}.ph-textarea{min-height:84px;padding:9px 10px;resize:vertical;line-height:1.5}.ph-textarea:hover,.ph-selectTrigger:hover{border-color:var(--dsw-alias-border-l1)}.ph-textarea:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-color:transparent}.ph-select{display:block;width:100%}.ph-select>[role=menu]{box-sizing:border-box;width:100%;min-width:100%;max-width:none}.ph-selectTrigger{height:36px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;text-align:left}.ph-selectTrigger[data-open=true]{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-color:transparent}.ph-check{display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:13px;line-height:18px}.ph-check input{position:absolute;opacity:0;pointer-events:none}.ph-checkBox{width:16px;height:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;display:flex;align-items:center;justify-content:center;color:transparent;margin-top:1px}.ph-check input:checked+.ph-checkBox{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:white}.ph-sectionTitle{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:2px}.ph-sectionTitle h3{margin:0 0 4px;font-size:14px}.ph-empty{padding:30px 14px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-tertiary)}.ph-error{padding:10px 12px;border-radius:9px;background:var(--dsw-alias-state-error-bg);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}.ph-status{display:flex;align-items:center;gap:8px}.ph-discovery{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2)}.ph-discoveryText{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}.ph-providerButtons{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l2)}.ph-account{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l2)}.ph-account:first-child{margin-top:10px}.ph-accountInfo{min-width:0}.ph-log{display:grid;grid-template-columns:84px minmax(120px,1fr) minmax(100px,.8fr) 52px 62px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px}.ph-logTime,.ph-logRoute,.ph-muted{color:var(--dsw-alias-label-tertiary)}.ph-logRoute{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ph-logLatency{text-align:right}.ph-accountCard{display:flex;flex-direction:column;gap:2px}.ph-accountCard>.ph-cardHead{padding-bottom:2px}.ph-spin{animation:ph-spin 1s linear infinite}@keyframes ph-spin{to{transform:rotate(360deg)}}@media(max-width:820px){.ph-grid,.ph-form{grid-template-columns:1fr}.ph-wide{grid-column:auto}.ph-hero,.ph-sectionTitle{flex-direction:column}.ph-log{grid-template-columns:72px minmax(90px,1fr) 50px 52px}.ph-logRoute{display:none}}
      .ph-keyNotice{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 16px;border:1px solid #86b7fe;border-radius:12px;background:#eff6ff;color:#172554}.ph-keyNoticeText{min-width:0;font-size:12px;line-height:1.55}.ph-keyValue{display:block;margin-top:7px;padding:8px 10px;border:1px solid #bfdbfe;border-radius:8px;background:#fff;color:#172554;font:600 12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;user-select:all}.ph-keyNoticeActions{display:flex;gap:7px;flex-wrap:wrap;flex:none}body[data-ds-dark-theme] .ph-keyNotice{border-color:#315d9b;background:#13233d;color:#dbeafe}body[data-ds-dark-theme] .ph-keyValue{border-color:#315d9b;background:#0b1526;color:#dbeafe}.ph-workspace{background:#f3f5f8;color:#18202b}.ph-workspaceInner{padding:18px;border:1px solid #dfe4eb;border-radius:16px;background:#fff;box-shadow:0 18px 60px rgb(24 35 52/.12);isolation:isolate;container-type:inline-size;container-name:providerHub}body[data-ds-dark-theme] .ph-workspace{background:#101318;color:#edf1f7}body[data-ds-dark-theme] .ph-workspaceInner{border-color:#303742;background:#171b21;box-shadow:0 18px 60px rgb(0 0 0/.35)}.ph-workspaceBar{padding:4px 2px}.ph-workspaceMark{box-shadow:0 8px 24px color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent)}.ph-dashboard{gap:16px}.ph-hero{position:relative;overflow:hidden;padding:20px;border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,var(--dsw-alias-border-l2));background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,var(--dsw-alias-bg-layer-2)),var(--dsw-alias-bg-layer-1));box-shadow:0 12px 36px color-mix(in srgb,#000 7%,transparent)}.ph-tabs{width:max-content;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}.ph-tab{padding:7px 14px;border:0!important;border-radius:7px}.ph-tab[data-active=true]{background:var(--dsw-specific-sidebar-nav-item-active);box-shadow:0 1px 4px color-mix(in srgb,#000 8%,transparent)}.ph-sectionTitle{padding-top:4px}.ph-sectionTitle h3{font-size:15px}.ph-grid{grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))}.ph-card{border-color:color-mix(in srgb,var(--dsw-alias-border-l2) 82%,transparent);box-shadow:0 7px 24px color-mix(in srgb,#000 5%,transparent);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.ph-card:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,var(--dsw-alias-border-l2));box-shadow:0 10px 30px color-mix(in srgb,#000 8%,transparent)}.ph-discovery{border-style:solid;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 84%,transparent)}.ph-specSummary{display:flex;gap:8px;flex-wrap:wrap}.ph-specSummary span{padding:5px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-secondary)}.ph-specList{display:flex;flex-direction:column;border:1px solid #dfe4eb;border-radius:12px;overflow:hidden;background:#fff}.ph-specRow{display:grid;grid-template-columns:minmax(170px,1.4fr) repeat(3,minmax(100px,.8fr)) minmax(130px,.9fr);align-items:center;gap:12px;padding:11px 13px;border-bottom:1px solid #e6e9ee;background:#fff}body[data-ds-dark-theme] .ph-specList{border-color:#303742;background:#1b2027}body[data-ds-dark-theme] .ph-specRow{border-bottom-color:#2c323c;background:#1b2027}.ph-specRow:last-child{border-bottom:0}.ph-specTop{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.ph-specId{font-weight:650;overflow-wrap:anywhere}.ph-specGrid{display:contents}.ph-specMetric{font-size:10px;color:var(--dsw-alias-label-tertiary)}.ph-specMetric strong{display:block;margin-top:2px;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}.ph-specTail{min-width:0}.ph-specError{color:var(--dsw-alias-state-warning-primary);font-size:10px;line-height:1.45}.ph-specSources{display:flex;gap:4px;flex-wrap:wrap}.ph-specSources{grid-column:1/-1;padding-top:4px}.ph-specSources .ph-model{font-size:12px;padding:4px 8px;border:1px solid #cbd5e1;background:#f8fafc;color:#1e3a5f}body[data-ds-dark-theme] .ph-specSources .ph-model{border-color:#475569;background:#111827;color:#bfdbfe}.ph-specRow[data-status=configured]{box-shadow:inset 4px 0 #25a66a}.ph-specRow[data-status=partial]{box-shadow:inset 4px 0 #d29a22}.ph-specRow[data-status=skipped]{box-shadow:inset 4px 0 #e47724}.ph-specRow[data-status=failed]{box-shadow:inset 4px 0 #d94b54}.ph-specStatus{display:inline-flex;align-items:center;padding:3px 7px;border:1px solid;border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap}.ph-specStatus[data-status=configured]{color:#166534;background:#dcfce7;border-color:#86efac}.ph-specStatus[data-status=partial]{color:#713f12;background:#fef3c7;border-color:#f5cf67}.ph-specStatus[data-status=skipped]{color:#7c2d12;background:#ffedd5;border-color:#fdba74}.ph-specStatus[data-status=failed]{color:#7f1d1d;background:#fee2e2;border-color:#fca5a5}.ph-specError{padding:5px 7px;border-radius:6px}.ph-specRow[data-status=skipped] .ph-specError{color:#7c2d12;background:#fff7ed}.ph-specRow[data-status=failed] .ph-specError{color:#7f1d1d;background:#fef2f2;font-weight:650}body[data-ds-dark-theme] .ph-specStatus[data-status=configured]{color:#bbf7d0;background:#14532d;border-color:#23814a}body[data-ds-dark-theme] .ph-specStatus[data-status=partial]{color:#fde68a;background:#713f12;border-color:#a16207}body[data-ds-dark-theme] .ph-specStatus[data-status=skipped]{color:#fed7aa;background:#7c2d12;border-color:#c2410c}body[data-ds-dark-theme] .ph-specStatus[data-status=failed]{color:#fecaca;background:#7f1d1d;border-color:#b91c1c}body[data-ds-dark-theme] .ph-specRow[data-status=skipped] .ph-specError{color:#fed7aa;background:#431407}body[data-ds-dark-theme] .ph-specRow[data-status=failed] .ph-specError{color:#fecaca;background:#450a0a}@container providerHub (max-width:700px){.ph-keyNotice{flex-direction:column}.ph-keyNoticeActions{width:100%}.ph-workspaceBar,.ph-sectionTitle,.ph-hero{align-items:flex-start;flex-direction:column}.ph-actions{flex-wrap:wrap}.ph-specRow{grid-template-columns:minmax(0,1fr);gap:9px}.ph-specGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.ph-specTail{width:100%;overflow-wrap:anywhere}.ph-specSources{width:100%}.ph-specSources .ph-model{white-space:normal}.ph-tabs{max-width:100%;overflow-x:auto}.ph-grid{grid-template-columns:minmax(0,1fr)}}.ph-modal{width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 32px)}.ph-modalBody{box-sizing:border-box;max-height:min(680px,calc(100vh - 210px))!important;overflow-y:auto!important;overscroll-behavior:contain;padding-bottom:96px!important;scroll-padding-bottom:96px}.ph-textarea{max-height:200px}@media(max-width:820px){.ph-workspace{padding:16px 12px}.ph-workspaceBar,.ph-sectionTitle,.ph-hero{align-items:flex-start;flex-direction:column}.ph-workspaceBar>.dsw-button,.ph-workspaceBar>button{align-self:flex-start}.ph-form{grid-template-columns:minmax(0,1fr)}.ph-wide{grid-column:1}.ph-specRow{grid-template-columns:minmax(0,1fr);gap:8px}.ph-specGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.ph-specTail{padding-top:2px}.ph-actions{flex-wrap:wrap}.ph-modal{width:calc(100vw - 20px);max-height:calc(100vh - 20px)}.ph-modalBody{max-height:calc(100vh - 190px)!important;padding-bottom:88px!important}.ph-textarea{resize:none}}
      .ph-specEvidence{display:flex;align-items:flex-start;gap:10px;grid-column:1/-1;margin-top:10px;padding-top:10px;border-top:1px solid #dbe3ec}.ph-specEvidenceLabel{flex:none;padding-top:5px;color:#475569;font-size:11px;font-weight:700;letter-spacing:.04em}.ph-specEvidence .ph-specSources{display:flex;flex:1;flex-wrap:wrap;gap:7px;min-width:0;padding:0}.ph-specEvidence .ph-model{max-width:100%;font-size:12px;line-height:1.35;overflow-wrap:anywhere}body[data-ds-dark-theme] .ph-specEvidence{border-top-color:#334155}body[data-ds-dark-theme] .ph-specEvidenceLabel{color:#cbd5e1}.ph-logSummary{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin-bottom:14px}.ph-logMetric{padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}.ph-logMetric span{display:block;color:var(--dsw-alias-label-tertiary);font-size:10px}.ph-logMetric strong{display:block;margin-top:4px;font-size:15px}.ph-logCard{padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}.ph-logCardHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.ph-logCardTitle{display:flex;align-items:center;gap:8px;min-width:0}.ph-logGroups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}.ph-logGroup{padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1)}.ph-logGroupTitle{margin-bottom:7px;color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:700;letter-spacing:.04em}.ph-logFacts{display:flex;gap:6px 12px;flex-wrap:wrap}.ph-logFact{color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.45}.ph-logFact small{color:var(--dsw-alias-label-tertiary);font-size:10px}.ph-logCost{font-size:14px;font-weight:700}.ph-logError{margin-top:8px;padding:7px 9px;border-radius:7px;background:var(--dsw-alias-state-error-bg);color:var(--dsw-alias-state-error-primary);font-size:11px;overflow-wrap:anywhere}@container providerHub (max-width:760px){.ph-logGroups{grid-template-columns:1fr}.ph-logCardHead{align-items:flex-start;flex-direction:column}}
    `;

    function hubApi(path, init) {
      return fetch(`/api/provider-hub${path}`, { headers: { 'content-type': 'application/json', ...(init?.headers || {}) }, ...init }).then(async (response) => {
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
        return value;
      });
    }

    function useHub() {
      const [state, setState] = React.useState(null);
      const [logs, setLogs] = React.useState([]);
      const [logSummary, setLogSummary] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const refresh = React.useCallback(async () => {
        setLoading(true); setError('');
        try { const [next, history] = await Promise.all([hubApi('/state'), hubApi('/logs')]); setState(next); setLogs(history.logs || []); setLogSummary(history.summary || null); }
        catch (reason) { setError(reason.message); }
        finally { setLoading(false); }
      }, []);
      React.useEffect(() => { refresh(); }, [refresh]);
      return { state, setState, logs, setLogs, logSummary, setLogSummary, loading, error, setError, refresh };
    }

    function Field({ label, hint, wide, children }) {
      return React.createElement('label', { className: `ph-field${wide ? ' ph-wide' : ''}` }, React.createElement('span', { className: 'ph-label' }, label), children, hint && React.createElement('span', { className: 'ph-hint' }, hint));
    }
    function TextInput(props) { return React.createElement(Input, { ...props, className: `ph-control${props.className ? ` ${props.className}` : ''}` }); }
    function parseModelList(value) { return [...new Set(String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]; }
    function routeTestModels(route) { return route.modelAllowlist?.length ? route.modelAllowlist : route.models || []; }
    function formatCount(value) { return Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value).toLocaleString() : '待补全'; }
    function reasoningText(value) { if (value === false) return '不支持'; const levels = value && typeof value === 'object' ? Object.keys(value) : []; return levels.length ? levels.join(' / ') : '待补全'; }
    function Checkbox({ checked, onChange, children, wide }) {
      return React.createElement('label', { className: `ph-check${wide ? ' ph-wide' : ''}` }, React.createElement('input', { type: 'checkbox', checked, onChange }), React.createElement('span', { className: 'ph-checkBox' }, React.createElement(IconCheckOutline16, { size: 12 })), React.createElement('span', null, children));
    }
    function Dropdown({ value, options, onChange, label }) {
      const [open, setOpen] = React.useState(false);
      const current = options.find((item) => item.id === value);
      return React.createElement(Menu, { open, portal: false, dense: true, className: 'ph-select', items: options, selectedId: value, onSelect: (id) => { onChange(id); setOpen(false); }, onClose: () => setOpen(false), anchor: React.createElement('button', { type: 'button', className: 'ph-selectTrigger', 'data-open': open, 'aria-label': label, 'aria-expanded': open, onClick: () => setOpen((currentOpen) => !currentOpen) }, React.createElement('span', null, current?.label || value), React.createElement(IconChevronDownOutline14, { size: 14 })) });
    }

    function GeneratedKeyNotice({ hub, service }) {
      const [copied, setCopied] = React.useState(false);
      if (!service?.generatedApiKey) return null;
      const copy = async () => { try { await navigator.clipboard.writeText(service.generatedApiKey); setCopied(true); } catch { hub.setError('复制失败，请手动选择并复制密钥。'); } };
      const acknowledge = async () => { try { await hubApi('/service/generated-key/acknowledge', { method: 'POST', body: '{}' }); hub.setState((current) => ({ ...current, service: { ...current.service, generatedApiKey: undefined } })); } catch (error) { hub.setError(error.message); } };
      return React.createElement('div', { className: 'ph-keyNotice' }, React.createElement('div', { className: 'ph-keyNoticeText' }, React.createElement('strong', null, '已自动创建客户端 API Key'), React.createElement('div', null, '首次启动已生成安全密钥。请复制保存；确认后页面不会再次显示明文。可在“服务设置”中随时替换。'), React.createElement('code', { className: 'ph-keyValue' }, service.generatedApiKey)), React.createElement('div', { className: 'ph-keyNoticeActions' }, React.createElement(Button, { variant: 'outline', size: 'sm', onClick: copy }, copied ? '已复制' : '复制 Key'), React.createElement(Button, { variant: 'primary', size: 'sm', onClick: acknowledge }, '我已保存')));
    }

    function ServiceCard({ hub }) {
      const service = hub.state?.service;
      const [saving, setSaving] = React.useState(false);
      const [editing, setEditing] = React.useState(false);
      if (!service) return null;
      const managed = hub.state?.managedProvider || {};
      const managedText = managed.status === 'synced' ? `DSH 供应商已同步（${managed.modelCount || 0} 个模型）` : managed.status === 'pending' ? 'DSH 供应商等待可用模型' : managed.status === 'conflict' ? 'DSH 同名供应商存在冲突，未覆盖' : managed.status === 'unavailable' ? 'DSH 设置服务暂不可用' : managed.status === 'removed' ? 'DSH 供应商已移除' : managed.status === 'error' ? 'DSH 供应商同步失败' : 'DSH 供应商等待同步';
      const toggle = async () => { setSaving(true); hub.setError(''); try { hub.setState(await hubApi('/service', { method: 'PUT', body: JSON.stringify({ ...service, enabled: !service.enabled }) })); } catch (error) { hub.setError(error.message); } finally { setSaving(false); } };
      return React.createElement('div', { className: 'ph-hero' },
        React.createElement('div', null,
          React.createElement('div', { className: 'ph-status' }, React.createElement(StateDot, { state: service.running ? 'done' : service.startError ? 'error' : 'warning' }), React.createElement('h2', { className: 'ph-title' }, service.running ? 'Provider Hub 运行中' : service.enabled ? 'Provider Hub 启动失败' : 'Provider Hub 已关闭')),
          React.createElement('div', { className: 'ph-sub' }, `${service.baseURL} · ${hub.state.routes.length} 个自定义渠道 · 客户端密钥${service.keyConfigured ? '已配置' : '未配置'}`),
          React.createElement('div', { className: 'ph-help', style: { marginTop: 6 } }, managedText),
          managed.error && React.createElement('div', { className: 'ph-error', style: { marginTop: 8 } }, managed.error),
          service.startError && React.createElement('div', { className: 'ph-error', style: { marginTop: 10 } }, service.startError),
          service.startNotice && React.createElement('div', { className: 'ph-help', style: { marginTop: 8 } }, service.startNotice)
        ),
        React.createElement('div', { className: 'ph-actions' },
          React.createElement(Button, { variant: service.enabled ? 'outline' : 'primary', size: 'sm', disabled: saving, icon: service.enabled ? React.createElement(IconPauseOutline16, { size: 16 }) : React.createElement(IconPlayOutline16, { size: 16 }), onClick: toggle }, service.enabled ? '关闭服务' : '开启服务'),
          React.createElement(Button, { variant: 'ghost', size: 'sm', icon: React.createElement(IconApiOutline14, { size: 16 }), onClick: () => setEditing(true) }, '服务设置'),
          React.createElement(Button, { variant: 'ghost', size: 'sm', icon: React.createElement(IconRefreshOutline16, { size: 16 }), onClick: hub.refresh }, '刷新')
        ),
        editing && React.createElement(ServiceEditor, { service, onClose: () => setEditing(false), onSaved: hub.setState, setError: hub.setError })
      );
    }

    function ServiceEditor({ service, onClose, onSaved, setError }) {
      const [form, setForm] = React.useState({ ...service, apiKey: '' });
      const [saving, setSaving] = React.useState(false);
      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
      const save = async () => { setSaving(true); setError(''); try { onSaved(await hubApi('/service', { method: 'PUT', body: JSON.stringify({ ...form, port: Number(form.port) }) })); onClose(); } catch (error) { setError(error.message); } finally { setSaving(false); } };
      return React.createElement(Modal, { open: true, onClose, title: 'Provider Hub 服务设置', closeLabel: '关闭服务设置', description: '默认仅本机访问；端口被占用时自动避让，不会停止已有服务。', footer: React.createElement(React.Fragment, null, React.createElement(Button, { variant: 'ghost', onClick: onClose }, '取消'), React.createElement(Button, { variant: 'primary', disabled: saving, onClick: save }, saving ? '保存中…' : '保存并重启')) },
        React.createElement('div', { className: 'ph-form' },
          React.createElement(Field, { label: '监听范围' }, React.createElement(Dropdown, { value: form.host, label: '监听范围', options: [{ id: '127.0.0.1', label: '仅本机 127.0.0.1' }, { id: '0.0.0.0', label: '可信局域网 0.0.0.0' }], onChange: (host) => setForm((current) => ({ ...current, host })) })),
          React.createElement(Field, { label: '首选端口' }, React.createElement(TextInput, { type: 'number', value: form.port, onChange: set('port') })),
          React.createElement(Field, { label: '客户端密钥变量名', wide: true }, React.createElement(TextInput, { value: form.apiKeyEnv, onChange: set('apiKeyEnv') })),
          React.createElement(Field, { label: '新的客户端访问密钥', hint: '留空保持现有密钥。LAN 模式必须配置。', wide: true }, React.createElement(TextInput, { type: 'password', value: form.apiKey, placeholder: service.keyConfigured ? '已配置；留空保持不变' : '输入访问密钥', onChange: set('apiKey') }))
        )
      );
    }

    function generatedCredentialRef(id) {
      const normalized = String(id || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
      return normalized ? `DSH_PROVIDER_HUB_${normalized}_KEY` : '';
    }

    const emptyRoute = { id: '', displayName: '', keyName: '', baseURL: '', api: 'openai-completions', apiKeyEnv: '', apiKeyEnvManual: false, apiKey: '', priority: 100, backup: false, modelsText: '', modelAllowlistText: '', discoveredModels: [], modelAliasesText: '{}', modelPricingText: '{}' };
    function RouteEditor({ route, onClose, onSaved, setError }) {
      const [form, setForm] = React.useState(() => route ? { ...route, keyName: route.keyName || route.displayName || route.id, apiKeyEnvManual: true, apiKey: '', modelsText: (route.models || []).join(', '), modelAllowlistText: (route.modelAllowlist || []).join(', '), discoveredModels: Object.values(route.modelMetadata || {}), modelAliasesText: JSON.stringify(route.modelAliases || {}, null, 2), modelPricingText: JSON.stringify(route.modelPricing || {}, null, 2) } : emptyRoute);
      const [saving, setSaving] = React.useState(false);
      const [discovering, setDiscovering] = React.useState(false);
      const [discovery, setDiscovery] = React.useState('');
      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
      const setRouteId = (event) => {
        const id = event.target.value;
        setForm((current) => ({ ...current, id, ...(current.apiKeyEnvManual ? {} : { apiKeyEnv: generatedCredentialRef(id) }) }));
      };
      const setCredentialRef = (event) => {
        const apiKeyEnv = event.target.value;
        setForm((current) => {
          const manual = Boolean(apiKeyEnv.trim());
          return { ...current, apiKeyEnv: manual ? apiKeyEnv : generatedCredentialRef(current.id), apiKeyEnvManual: manual };
        });
      };
      const discover = async () => {
        setDiscovering(true); setDiscovery(''); setError('');
        const request = { settingsNs: 'llm-pi-ai', baseURL: form.baseURL, api: form.api, ...(form.apiKey ? { apiKey: form.apiKey } : {}) };
        try {
          let models;
          let source = 'DSH';
          if (dshApi?.llm?.discoverModels) { const response = await dshApi.llm.discoverModels(request); if (response.result.ok) models = response.result.value.models; }
          if (!models?.length) { const fallback = await hubApi('/models/discover', { method: 'POST', body: JSON.stringify(form) }); models = fallback.models; source = '供应商端点'; }
          const ids = [...new Set(models.map((item) => item.id).filter(Boolean))];
          setForm((current) => ({ ...current, modelsText: ids.join(', '), discoveredModels: models }));
          setDiscovery(`已从${source}获取 ${ids.length} 个模型，保存渠道后生效。`);
        } catch (error) { setError(error.message); } finally { setDiscovering(false); }
      };
      const save = async () => { setSaving(true); setError(''); try { let aliases; let pricing; try { aliases = JSON.parse(form.modelAliasesText || '{}'); } catch { throw new Error('模型别名必须是有效 JSON'); } try { pricing = JSON.parse(form.modelPricingText || '{}'); } catch { throw new Error('模型价格必须是有效 JSON'); } const modelIds = parseModelList(form.modelsText); const modelAllowlist = parseModelList(form.modelAllowlistText); const discovered = new Map((form.discoveredModels || []).map((model) => [model.id, model])); const models = modelIds.map((id) => discovered.get(id) || id); const next = await hubApi('/routes', { method: 'POST', body: JSON.stringify({ ...form, priority: Number(form.priority), models, modelAllowlist, modelAliases: aliases, modelPricing: pricing }) }); onSaved(next); onClose(); } catch (error) { setError(error.message); } finally { setSaving(false); } };
      return React.createElement(Modal, { open: true, onClose, title: route ? '编辑供应商渠道' : '添加供应商渠道', closeLabel: '关闭渠道编辑', description: '可直接配置官方 API、中转站或任意 OpenAI-compatible 服务。', className: 'ph-modal', contentClassName: 'ph-modalBody', footer: React.createElement(React.Fragment, null, React.createElement(Button, { variant: 'ghost', onClick: onClose }, '取消'), React.createElement(Button, { variant: 'primary', disabled: saving, onClick: save }, saving ? '保存中…' : '保存渠道')) },
        React.createElement('div', { className: 'ph-form' },
          React.createElement(Field, { label: '渠道 ID', hint: '保存后不可修改。' }, React.createElement(TextInput, { value: form.id, disabled: Boolean(route), placeholder: 'openai-official', onChange: setRouteId })),
          React.createElement(Field, { label: '渠道显示名称' }, React.createElement(TextInput, { value: form.displayName, placeholder: 'OpenAI 官方', onChange: set('displayName') })),
          React.createElement(Field, { label: 'API Key 名称', hint: '用于区分同一 Base URL 下的多个 Key，并显示在请求日志中；不会发送给上游。' }, React.createElement(TextInput, { value: form.keyName, placeholder: '生产 Key / 备用 Key', onChange: set('keyName') })),
          React.createElement(Field, { label: 'Base URL', hint: '同一地址可以建立多个独立渠道；每个渠道拥有自己的 Key 名称、凭据、优先级与模型白名单。通常填写到 /v1。', wide: true }, React.createElement(TextInput, { value: form.baseURL, placeholder: 'https://api.openai.com/v1', onChange: set('baseURL') })),
          React.createElement(Field, { label: '凭据变量名', hint: '随渠道 ID 自动生成；需要共享现有凭据时可手动修改。' }, React.createElement(TextInput, { value: form.apiKeyEnv, placeholder: '输入渠道 ID 后自动生成', onChange: setCredentialRef })),
          React.createElement(Field, { label: 'API Key', hint: '只写入 DSH credentials。' }, React.createElement(TextInput, { type: 'password', value: form.apiKey, placeholder: route?.keyConfigured ? '已配置；留空保持不变' : '输入供应商 API Key', onChange: set('apiKey') })),
          React.createElement(Field, { label: '优先级' }, React.createElement(TextInput, { type: 'number', value: form.priority, onChange: set('priority') })),
          React.createElement(Field, { label: '协议' }, React.createElement(Dropdown, { value: form.api, label: '供应商协议', options: [{ id: 'openai-completions', label: 'OpenAI Chat Completions' }, { id: 'openai-responses', label: 'OpenAI Responses' }], onChange: (api) => setForm((current) => ({ ...current, api })) })),
          React.createElement('div', { className: 'ph-field ph-wide' }, React.createElement('div', { className: 'ph-discovery' }, React.createElement('div', { className: 'ph-discoveryText' }, React.createElement('strong', null, '供应商模型目录'), React.createElement('br'), discovery || '复用 DSH 的模型发现能力；失败时使用已保存凭据直接读取供应商目录。'), React.createElement(Button, { variant: 'outline', size: 'sm', disabled: discovering || !form.baseURL, icon: discovering ? React.createElement(IconLoadingOutline16, { size: 16, className: 'ph-spin' }) : React.createElement(IconRefreshOutline16, { size: 16 }), onClick: discover }, discovering ? '获取中…' : '获取全部模型'))),
          React.createElement(Field, { label: '上游支持模型', hint: '供应商完整模型目录；获取后可手动修正，支持逗号或换行分隔。', wide: true }, React.createElement('textarea', { className: 'ph-textarea', value: form.modelsText, placeholder: 'gpt-4.1, gpt-4.1-mini', onChange: set('modelsText') })),
          React.createElement(Field, { label: '白名单模型路由', hint: '仅限制当前 API Key，支持逗号或换行分隔。留空允许全部上游支持模型；填写后其他模型不会路由到这个 Key。', wide: true }, React.createElement('textarea', { className: 'ph-textarea', value: form.modelAllowlistText, placeholder: 'gpt-4.1', onChange: set('modelAllowlistText') })),
          React.createElement(Field, { label: '模型别名 JSON', hint: '本地模型 ID 到上游模型 ID 的映射。', wide: true }, React.createElement('textarea', { className: 'ph-textarea', value: form.modelAliasesText, onChange: set('modelAliasesText') })),
          React.createElement(Field, { label: '模型价格 JSON（每百万 Token）', hint: '可选。示例：{"gpt-5.6-sol":{"inputPerMillion":1.25,"cachedInputPerMillion":0.125,"outputPerMillion":10,"reasoningPerMillion":10,"currency":"USD"}}。未配置时日志只显示 Token，不虚构费用。', wide: true }, React.createElement('textarea', { className: 'ph-textarea', value: form.modelPricingText, onChange: set('modelPricingText') })),
          React.createElement(Checkbox, { checked: form.backup, wide: true, onChange: (event) => setForm((current) => ({ ...current, backup: event.target.checked })) }, '作为保底渠道：仅在普通渠道不可用时使用')
        )
      );
    }

    function researchErrorText(error) {
      const value = String(error || '');
      if (/no (?:official|usable specification) source/i.test(value)) return '未找到可验证的规格来源';
      if (/(?:did not|available evidence did not) prove any supported specification field/i.test(value)) return '现有证据未证明可用的规格字段';
      if (/vendor cannot be identified/i.test(value)) return '无法安全识别模型厂商';
      return value || '尚未获得规格证据';
    }

    function evidenceLabel(model, field) {
      const type = model.fieldEvidence?.[field]?.type;
      return type === 'community-consensus' ? '社区共识' : type === 'official' ? '官方证据' : '';
    }

    function ModelSpecifications({ research }) {
      const models = research?.models || [];
      if (models.length === 0) return React.createElement('div', { className: 'ph-empty' }, '保存带模型目录的渠道后，这里会自动显示并补全模型规格。');
      return React.createElement('div', { className: 'ph-specList' }, models.map((model) => {
        const populated = [model.contextWindow, model.maxTokens, model.reasoningEfforts !== undefined].filter(Boolean).length;
        const status = model.status === 'running' ? '补全中' : model.configured ? (populated === 3 ? '规格完整' : '部分补全') : model.status === 'failed' ? '补全失败' : model.status === 'skipped' ? '缺少证据' : '等待自动补全';
        const statusKey = model.status === 'failed' ? 'failed' : model.status === 'skipped' ? 'skipped' : model.configured && populated === 3 ? 'configured' : model.configured ? 'partial' : 'pending';
        return React.createElement('article', { className: 'ph-specRow', 'data-status': statusKey, key: model.id },
          React.createElement('div', { className: 'ph-specTop' }, React.createElement('div', null, React.createElement('div', { className: 'ph-specId' }, model.name || model.id), model.name && React.createElement('div', { className: 'ph-meta' }, model.id)), React.createElement('span', { className: 'ph-specStatus', 'data-status': statusKey }, status)),
          React.createElement('div', { className: 'ph-specGrid' },
            React.createElement('div', { className: 'ph-specMetric' }, '上下文窗口', React.createElement('strong', null, formatCount(model.contextWindow)), evidenceLabel(model, 'contextWindow') && React.createElement('span', { className: 'ph-meta' }, evidenceLabel(model, 'contextWindow'))),
            React.createElement('div', { className: 'ph-specMetric' }, '最大输出窗口', React.createElement('strong', null, formatCount(model.maxTokens)), evidenceLabel(model, 'maxTokens') && React.createElement('span', { className: 'ph-meta' }, evidenceLabel(model, 'maxTokens'))),
            React.createElement('div', { className: 'ph-specMetric' }, '思考程度', React.createElement('strong', null, reasoningText(model.reasoningEfforts)), evidenceLabel(model, 'reasoningEfforts') && React.createElement('span', { className: 'ph-meta' }, evidenceLabel(model, 'reasoningEfforts')))
          ),
          React.createElement('div', { className: 'ph-specTail' }, model.error && React.createElement('div', { className: 'ph-specError' }, researchErrorText(model.error)), !model.sources?.length && !model.error && React.createElement('span', { className: 'ph-muted' }, '等待可验证来源')),
          model.sources?.length ? React.createElement('div', { className: 'ph-specEvidence' }, React.createElement('span', { className: 'ph-specEvidenceLabel' }, '证据来源'), React.createElement('div', { className: 'ph-specSources' }, model.sources.map((source) => React.createElement('a', { className: 'ph-model', href: source, target: '_blank', rel: 'noreferrer', key: source }, new URL(source).hostname)))) : null
        );
      }));
    }

    function Channels({ hub }) {
      const [editing, setEditing] = React.useState(null);
      const [testing, setTesting] = React.useState('');
      const [deleting, setDeleting] = React.useState(null);
      const [research, setResearch] = React.useState(hub.state?.modelResearch || null);
      React.useEffect(() => { if (hub.state?.modelResearch) setResearch(hub.state.modelResearch); }, [hub.state?.modelResearch]);
      const runningResearch = research?.phase === 'running';
      const test = async (route) => { setTesting(route.id); hub.setError(''); try { const result = await hubApi(`/routes/${encodeURIComponent(route.id)}/test`, { method: 'POST', body: JSON.stringify({ model: routeTestModels(route)[0] }) }); hub.setError(result.ok ? '' : `测试失败：HTTP ${result.status} ${result.preview || ''}`); hub.refresh(); } catch (error) { hub.setError(error.message); } finally { setTesting(''); } };
      const remove = async () => { try { hub.setState(await hubApi(`/routes/${encodeURIComponent(deleting.id)}`, { method: 'DELETE' })); setDeleting(null); } catch (error) { hub.setError(error.message); } };
      const startResearch = async () => { hub.setError(''); try { const response = await hubApi('/models/research', { method: 'POST', body: '{}' }); setResearch(response.research); } catch (error) { hub.setError(error.message); } };
      React.useEffect(() => {
        if (!runningResearch) return;
        const timer = setInterval(async () => { try { const next = await hubApi('/models/research'); setResearch(next); if (next.phase !== 'running') hub.refresh(); } catch (error) { hub.setError(error.message); } }, 1500);
        return () => clearInterval(timer);
      }, [runningResearch]);
      const routes = hub.state?.routes || [];
      const retryable = research?.phase === 'error' || (research?.phase === 'done' && ((research.skipped || 0) > 0 || (research.failed || 0) > 0));
      const researchText = runningResearch ? `${research.automatic ? '自动' : '手动'}补全中 ${research.completed || 0}/${research.total || 0}${research.currentModel ? `：${research.currentModel}` : ''}` : research?.phase === 'done' ? `自动补全完成：已补全 ${research.updated || 0} 个，缺少证据 ${research.skipped || 0} 个，失败 ${research.failed || 0} 个` : research?.phase === 'error' ? `自动补全失败：${research.error || `${research.failed || 0} 个模型失败`}` : '保存渠道或官方账号发现新模型后自动从官方来源补全规格';
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'ph-sectionTitle' }, React.createElement('div', null, React.createElement('h3', null, 'API 渠道'), React.createElement('div', { className: 'ph-help' }, '多个 API 与 Key 统一代理；普通渠道优先，故障冷却后自动切换，保底渠道最后接管。')), React.createElement('div', { className: 'ph-actions' }, retryable && React.createElement(Button, { variant: 'outline', size: 'sm', disabled: runningResearch || !research?.available || !(research?.models?.length), icon: React.createElement(IconRefreshOutline16, { size: 16 }), onClick: startResearch }, '一键填写规格'), React.createElement(Button, { variant: 'primary', size: 'sm', icon: React.createElement(IconPlusOutline16, { size: 16 }), onClick: () => setEditing(false) }, '添加 API 渠道'))),
        React.createElement('div', { className: 'ph-discovery' }, React.createElement('div', { className: 'ph-discoveryText' }, React.createElement('strong', null, '自动模型规格'), React.createElement('br'), researchText), runningResearch && React.createElement(IconLoadingOutline16, { size: 16, className: 'ph-spin' })),
        routes.length === 0 ? React.createElement('div', { className: 'ph-empty' }, '还没有自定义渠道。可添加官方 API、中转站或本地模型网关；官方账号渠道由“账号服务”自动管理。') : React.createElement('div', { className: 'ph-grid' }, routes.map((route) => React.createElement('article', { className: 'ph-card', key: route.id },
          React.createElement('div', { className: 'ph-cardHead' }, React.createElement('div', null, React.createElement('div', { className: 'ph-cardName' }, route.keyName || route.displayName), React.createElement('div', { className: 'ph-meta' }, `${route.displayName} · ${route.baseURL}`)), React.createElement(Pill, { active: route.keyConfigured && !route.backup }, route.backup ? '保底' : route.keyConfigured ? '已配置' : '免 Key / 未配置')),
          React.createElement('div', { className: 'ph-models' }, ((route.modelAllowlist?.length ? route.modelAllowlist : route.models) || []).slice(0, 5).map((model) => React.createElement('span', { className: 'ph-model', key: model }, model)), (route.modelAllowlist?.length ? route.modelAllowlist.length : route.models?.length || 0) > 5 && React.createElement('span', { className: 'ph-model' }, `+${(route.modelAllowlist?.length ? route.modelAllowlist.length : route.models.length) - 5}`)),
          React.createElement('div', { className: 'ph-meta' }, `优先级 ${route.priority} · ${route.modelAllowlist?.length ? `${route.modelAllowlist.length} 个白名单模型` : '允许全部支持模型'} · ${route.apiKeyEnv}`),
          React.createElement('div', { className: 'ph-rowActions' }, React.createElement(Button, { variant: 'ghost', size: 'sm', disabled: testing === route.id || routeTestModels(route).length === 0, onClick: () => test(route) }, testing === route.id ? '测试中…' : '测试'), React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: () => setEditing(route) }, '编辑'), React.createElement(Button, { variant: 'ghost', size: 'sm', icon: React.createElement(IconTrashOutline16, { size: 15 }), 'aria-label': '删除渠道', onClick: () => setDeleting(route) }))
        ))),
        editing !== null && React.createElement(RouteEditor, { route: editing || undefined, onClose: () => setEditing(null), onSaved: hub.setState, setError: hub.setError }),
        deleting && React.createElement(Modal, { open: true, onClose: () => setDeleting(null), title: '删除供应商渠道', description: `确定删除“${deleting.displayName}”？已保存的 DSH 凭据会保留，避免影响共享账号。`, footer: React.createElement(React.Fragment, null, React.createElement(Button, { variant: 'ghost', onClick: () => setDeleting(null) }, '取消'), React.createElement(Button, { variant: 'outline', onClick: remove }, '删除渠道')) })
      );
    }

    function Specifications({ hub }) {
      const [research, setResearch] = React.useState(hub.state?.modelResearch || null);
      const [selectionKey, setSelectionKey] = React.useState('');
      const running = research?.phase === 'running';
      const retryable = !running && (research?.models?.length || 0) > 0;
      React.useEffect(() => { if (hub.state?.modelResearch) { setResearch(hub.state.modelResearch); const selected = hub.state.modelResearch.selection; if (selected?.routeId) setSelectionKey(`${selected.routeId}::${selected.model}`); } }, [hub.state?.modelResearch]);
      React.useEffect(() => {
        if (!running) return;
        const timer = setInterval(async () => { try { const next = await hubApi('/models/research'); setResearch(next); if (next.phase !== 'running') hub.refresh(); } catch (error) { hub.setError(error.message); } }, 1500);
        return () => clearInterval(timer);
      }, [running]);
      const retry = async () => { hub.setError(''); try { const [routeId, model] = selectionKey.split('::'); const next = await hubApi('/models/research', { method: 'POST', body: JSON.stringify(routeId && model ? { routeId, model } : {}) }); setResearch(next.research); } catch (error) { hub.setError(error.message); } };
      const models = research?.models || [];
      const complete = models.filter((model) => model.configured && model.contextWindow && model.maxTokens && model.reasoningEfforts !== undefined).length;
      const partial = models.filter((model) => model.configured && !(model.contextWindow && model.maxTokens && model.reasoningEfforts !== undefined)).length;
      const missing = models.filter((model) => model.status === 'skipped').length;
      const failed = models.filter((model) => model.status === 'failed').length;
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'ph-sectionTitle' }, React.createElement('div', null, React.createElement('h3', null, '模型规格'), React.createElement('div', { className: 'ph-help' }, `官方来源优先；无官方资料时，至少两个独立社区来源对同一字段形成共识才写入。研究调用：${research?.selection?.label || (research?.selection ? `${research.selection.provider} / ${research.selection.model}` : '等待可用文本模型')}`)), React.createElement('div', { className: 'ph-actions' }, retryable && React.createElement(Button, { variant: 'outline', size: 'sm', disabled: running || !research?.available, icon: React.createElement(IconRefreshOutline16, { size: 16 }), onClick: retry }, '一键填写规格'))),
        research?.selections?.length ? React.createElement('div', { className: 'ph-discovery' }, React.createElement('div', { className: 'ph-discoveryText' }, React.createElement('strong', null, '研究 API Key 与文本模型'), React.createElement('br'), '默认选择第一个已配置 Key 的第一个文本模型；已自动排除生图、音频、嵌入与重排模型。'), React.createElement(Dropdown, { value: selectionKey || `${research.selections[0].routeId}::${research.selections[0].model}`, label: '研究模型', options: research.selections.map((item) => ({ id: `${item.routeId}::${item.model}`, label: item.label })), onChange: setSelectionKey })) : null,
        React.createElement('div', { className: 'ph-specSummary' }, React.createElement('span', null, `${complete} 完整`), React.createElement('span', null, `${partial} 部分补全`), React.createElement('span', null, `${missing} 缺少证据`), React.createElement('span', null, `${failed} 失败`), running && React.createElement('span', null, `补全中 ${research.completed || 0}/${research.total || 0}`)),
        React.createElement(ModelSpecifications, { research })
      );
    }

    const providerNames = { codex: 'OpenAI / Codex', anthropic: 'Anthropic / Claude', gemini: 'Google / Gemini', claude: 'Anthropic / Claude' };
    function AccountService({ hub }) {
      const accountService = hub.state?.accountService || {};
      const [busy, setBusy] = React.useState('');
      const [editing, setEditing] = React.useState(false);
      const [oauth, setOauth] = React.useState(null);
      const update = (next) => hub.setState((current) => ({ ...current, accountService: next }));
      const action = async (key, path) => { setBusy(key); hub.setError(''); try { update(await hubApi(path, { method: 'POST', body: '{}' })); } catch (error) { hub.setError(error.message); } finally { setBusy(''); } };
      const startOAuth = async (provider) => { setBusy(`oauth-${provider}`); hub.setError(''); try { const session = await hubApi(`/account-service/oauth/${provider}/start`, { method: 'POST', body: '{}' }); setOauth(session); window.open(session.url, '_blank', 'noopener,noreferrer'); } catch (error) { hub.setError(error.message); } finally { setBusy(''); } };
      const toggleAccount = async (account) => { setBusy(`account-${account.id}`); try { update(await hubApi(`/account-service/accounts/${encodeURIComponent(account.id)}/status`, { method: 'PATCH', body: JSON.stringify({ disabled: !account.disabled }) })); } catch (error) { hub.setError(error.message); } finally { setBusy(''); } };
      const deleteAccount = async (account) => { if (!window.confirm(`删除账号“${account.name || account.id}”？此操作会删除本地授权文件。`)) return; setBusy(`account-${account.id}`); try { update(await hubApi(`/account-service/accounts/${encodeURIComponent(account.id)}`, { method: 'DELETE' })); } catch (error) { hub.setError(error.message); } finally { setBusy(''); } };
      React.useEffect(() => {
        if (!oauth?.state || oauth.status !== 'wait') return;
        const timer = setInterval(async () => { try { const next = await hubApi(`/account-service/oauth/status?state=${encodeURIComponent(oauth.state)}`); setOauth(next); if (next.status !== 'wait') update(await hubApi('/account-service/refresh', { method: 'POST', body: '{}' })); } catch (error) { setOauth((current) => ({ ...current, status: 'error', error: error.message })); } }, 2000);
        return () => clearInterval(timer);
      }, [oauth?.state, oauth?.status]);
      const phaseText = { idle: '尚未启动', 'not-installed': '未安装', installing: '正在安装', installed: '已安装', starting: '正在启动', running: '运行中', stopped: '已停止', error: '启动失败' }[accountService.phase] || accountService.phase || '未知';
      const transient = ['installing', 'starting'].includes(accountService.phase) || Boolean(busy);
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'ph-sectionTitle' }, React.createElement('div', null, React.createElement('h3', null, '内置官方账号服务'), React.createElement('div', { className: 'ph-help' }, 'Provider Hub 自行下载并校验固定版本的账户服务；无需安装其他桌面程序。')), React.createElement('div', { className: 'ph-actions' },
          accountService.running ? React.createElement(Button, { variant: 'ghost', size: 'sm', className: 'ph-danger', disabled: transient, icon: React.createElement(IconPauseOutline16, { size: 16 }), onClick: () => action('stop', '/account-service/stop') }, '停止服务') : React.createElement(Button, { variant: 'primary', size: 'sm', disabled: transient || !accountService.enabled, icon: transient ? React.createElement(IconLoadingOutline16, { className: 'ph-spin', size: 16 }) : React.createElement(IconPlayOutline16, { size: 16 }), onClick: () => action('start', accountService.installed ? '/account-service/start' : '/account-service/install') }, accountService.installed ? '启动服务' : '安装并启动'),
          React.createElement(Button, { variant: 'ghost', size: 'sm', icon: React.createElement(IconBranchOutline16, { size: 16 }), onClick: () => setEditing(true) }, '路由设置'),
          React.createElement(Button, { variant: 'ghost', size: 'sm', disabled: transient || !accountService.running, icon: React.createElement(IconRefreshOutline16, { size: 16 }), onClick: () => action('refresh', '/account-service/refresh') }, '刷新账号')
        )),
        React.createElement('div', { className: 'ph-card ph-accountCard' },
          React.createElement('div', { className: 'ph-cardHead' }, React.createElement('div', null, React.createElement('div', { className: 'ph-status' }, React.createElement(StateDot, { state: accountService.running ? 'done' : accountService.phase === 'error' ? 'error' : 'warning' }), React.createElement('div', { className: 'ph-cardName' }, phaseText)), React.createElement('div', { className: 'ph-meta' }, `CLIProxyAPI v${accountService.version || '—'} · ${accountService.baseURL || `首选端口 ${accountService.port || 19629}`} · 路由优先级 ${accountService.priority ?? 1000}`)), React.createElement(Pill, { active: accountService.running }, accountService.running ? `${accountService.modelCount || 0} 个模型` : accountService.installed ? '已安装' : '未安装')),
          (accountService.error || accountService.accountError) && React.createElement('div', { className: 'ph-error', style: { marginTop: 10 } }, accountService.error || accountService.accountError),
          accountService.running && React.createElement('div', { className: 'ph-providerButtons' }, accountService.providers.map((provider) => React.createElement(Button, { key: provider, variant: 'outline', size: 'sm', disabled: transient, icon: React.createElement(IconGlobeOutline14, { size: 14 }), onClick: () => startOAuth(provider) }, busy === `oauth-${provider}` ? '准备授权…' : `登录 ${providerNames[provider]}`))),
          oauth && React.createElement('div', { className: 'ph-discovery', style: { marginTop: 12 } }, React.createElement('div', { className: 'ph-status' }, React.createElement(StateDot, { state: oauth.status === 'wait' ? 'ongoing' : oauth.status === 'ok' ? 'done' : 'error' }), React.createElement('div', { className: 'ph-discoveryText' }, oauth.status === 'wait' ? `等待 ${providerNames[oauth.provider]} 授权；完成后会自动刷新账号。` : oauth.status === 'ok' ? '授权完成，账号已安全保存在本地。' : `授权失败：${oauth.error || '未知错误'}`)), oauth.status === 'wait' && React.createElement(Button, { variant: 'ghost', size: 'sm', icon: React.createElement(IconLinkOutline16, { size: 16 }), onClick: () => window.open(oauth.url, '_blank', 'noopener,noreferrer') }, '打开授权页')),
          accountService.running && accountService.accounts?.length === 0 && React.createElement('div', { className: 'ph-empty', style: { marginTop: 14 } }, '尚未登录官方账号。选择 Codex、Claude 或 Gemini 开始官方 OAuth。'),
          accountService.accounts?.map((account) => React.createElement('div', { className: 'ph-account', key: account.id }, React.createElement('div', { className: 'ph-accountInfo' }, React.createElement('div', { className: 'ph-cardName' }, account.name || account.id), React.createElement('div', { className: 'ph-meta' }, `${providerNames[account.provider] || account.provider || '官方账号'} · ${account.status || 'unknown'}`)), React.createElement('div', { className: 'ph-actions' }, React.createElement(Pill, { active: !account.disabled && !account.unavailable }, account.disabled ? '已停用' : account.unavailable ? '暂不可用' : '可用'), React.createElement(Button, { variant: 'ghost', size: 'sm', disabled: busy === `account-${account.id}`, onClick: () => toggleAccount(account) }, account.disabled ? '启用' : '停用'), React.createElement(Button, { variant: 'ghost', size: 'sm', disabled: busy === `account-${account.id}`, icon: React.createElement(IconTrashOutline16, { size: 15 }), 'aria-label': '删除账号', onClick: () => deleteAccount(account) }))))
        ),
        editing && React.createElement(AccountServiceEditor, { accountService, onClose: () => setEditing(false), onSaved: update, setError: hub.setError })
      );
    }

    function AccountServiceEditor({ accountService, onClose, onSaved, setError }) {
      const [form, setForm] = React.useState({ enabled: accountService.enabled !== false, autoInstall: accountService.autoInstall !== false, port: accountService.port || 19629, priority: accountService.priority ?? 1000 });
      const [saving, setSaving] = React.useState(false);
      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
      const save = async () => { setSaving(true); setError(''); try { onSaved(await hubApi('/account-service', { method: 'PUT', body: JSON.stringify({ ...form, port: Number(form.port), priority: Number(form.priority) }) })); onClose(); } catch (error) { setError(error.message); } finally { setSaving(false); } };
      return React.createElement(Modal, { open: true, onClose, title: '账号服务设置', className: 'ph-modal', contentClassName: 'ph-modalBody', description: '服务固定监听本机回环地址。端口冲突时会自动顺延，绝不停止占用端口的进程。', footer: React.createElement(React.Fragment, null, React.createElement(Button, { variant: 'ghost', onClick: onClose }, '取消'), React.createElement(Button, { variant: 'primary', disabled: saving, onClick: save }, saving ? '保存中…' : '保存设置')) }, React.createElement('div', { className: 'ph-form' },
        React.createElement(Field, { label: '首选端口' }, React.createElement(TextInput, { type: 'number', value: form.port, onChange: set('port') })),
        React.createElement(Field, { label: '路由优先级', hint: '官方账号渠道与自定义渠道共同排序。' }, React.createElement(TextInput, { type: 'number', value: form.priority, onChange: set('priority') })),
        React.createElement(Checkbox, { checked: form.enabled, wide: true, onChange: (event) => setForm((current) => ({ ...current, enabled: event.target.checked })) }, '启用内置账号服务'),
        React.createElement(Checkbox, { checked: form.autoInstall, wide: true, onChange: (event) => setForm((current) => ({ ...current, autoInstall: event.target.checked })) }, '未安装时自动下载固定版本并校验 SHA-256')
      ));
    }

    function formatTokens(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '未返回'; }
    function formatCost(value, currency) { if (!Number.isFinite(Number(value))) return '未配置'; const amount = Number(value); return `${currency || 'USD'} ${amount < .01 ? amount.toPrecision(3) : amount.toFixed(4)}`; }
    function Logs({ hub }) {
      const clear = async () => { await hubApi('/logs', { method: 'DELETE' }); hub.setLogs([]); hub.setLogSummary(null); };
      const summary = hub.logSummary || {};
      const costs = Object.entries(summary.costByCurrency || {}).map(([currency, amount]) => formatCost(amount, currency)).join(' · ') || '未配置';
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'ph-sectionTitle' }, React.createElement('div', null, React.createElement('h3', null, '请求日志与用量'), React.createElement('div', { className: 'ph-help' }, '记录路由 Key、Token、首 Token 延迟、完整耗时和费用依据；不记录密钥、凭据引用、提示词、完整响应或上游 URL。')), React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: clear }, '清空')),
        React.createElement('div', { className: 'ph-logSummary' },
          [['请求', summary.requests || 0], ['渠道尝试', summary.attempts || 0], ['故障切换', summary.failovers || 0], ['成功 / 失败', `${summary.successful || 0} / ${summary.failed || 0}`], ['输入 Token', formatTokens(summary.inputTokens)], ['缓存输入', formatTokens(summary.cachedInputTokens)], ['输出 Token', formatTokens(summary.outputTokens)], ['推理 Token', formatTokens(summary.reasoningTokens)], ['总 Token', formatTokens(summary.totalTokens)], ['平均耗时', `${summary.averageLatencyMs || 0}ms`], ['估算费用', costs]].map(([label, value]) => React.createElement('div', { className: 'ph-logMetric', key: label }, React.createElement('span', null, label), React.createElement('strong', null, value)))),
        hub.logs.length === 0 ? React.createElement('div', { className: 'ph-empty' }, '暂无请求日志。') : React.createElement('div', null, hub.logs.map((log) => React.createElement('article', { className: 'ph-logCard', key: log.id },
          React.createElement('div', { className: 'ph-logCardHead' }, React.createElement('div', { className: 'ph-logCardTitle' }, React.createElement('strong', null, log.model), React.createElement('span', { className: 'ph-muted' }, log.keyName || log.routeName), log.attempt > 1 && React.createElement('span', { className: 'ph-model' }, `尝试 ${log.attempt}`)), React.createElement('div', null, React.createElement('span', { style: { color: log.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)', fontWeight: 700 } }, log.status || 'ERR'), React.createElement('span', { className: 'ph-muted', style: { marginLeft: 8 } }, new Date(log.time).toLocaleTimeString()))),
          React.createElement('div', { className: 'ph-logGroups' },
            React.createElement('div', { className: 'ph-logGroup' }, React.createElement('div', { className: 'ph-logGroupTitle' }, 'TOKEN 用量'), React.createElement('div', { className: 'ph-logFacts' }, React.createElement('span', { className: 'ph-logFact' }, `输入 ${formatTokens(log.inputTokens)}${log.usageSource === 'estimated' ? '（估算）' : log.usageSource === 'incomplete-estimate' ? '（部分估算）' : ''}`), React.createElement('span', { className: 'ph-logFact' }, `缓存 ${formatTokens(log.cachedInputTokens)}`), React.createElement('span', { className: 'ph-logFact' }, `输出 ${formatTokens(log.outputTokens)}${log.usageSource === 'estimated' ? '（估算）' : log.usageSource === 'incomplete-estimate' ? '（部分估算）' : ''}`), React.createElement('span', { className: 'ph-logFact' }, `推理 ${formatTokens(log.reasoningTokens)}`), React.createElement('span', { className: 'ph-logFact' }, `总计 ${formatTokens(log.totalTokens)}`))),
            React.createElement('div', { className: 'ph-logGroup' }, React.createElement('div', { className: 'ph-logGroupTitle' }, '性能与协议'), React.createElement('div', { className: 'ph-logFacts' }, React.createElement('span', { className: 'ph-logFact' }, `首 Token ${log.timeToFirstTokenMs !== undefined ? `${log.timeToFirstTokenMs}ms` : '未返回'}`), React.createElement('span', { className: 'ph-logFact' }, `总耗时 ${log.totalLatencyMs ?? log.latencyMs}ms`), log.finishReason && React.createElement('span', { className: 'ph-logFact' }, `结束 ${log.finishReason}`), React.createElement('span', { className: 'ph-logFact' }, `${log.streaming ? '流式' : '非流式'} · ${log.api || log.endpoint || 'chat'}`), React.createElement('span', { className: 'ph-logFact' }, `${log.messageCount || 0} 消息 · ${log.toolCount || 0} 工具`), (log.rateLimitRemainingRequests !== undefined || log.rateLimitRemainingTokens !== undefined) && React.createElement('span', { className: 'ph-logFact' }, `剩余 ${log.rateLimitRemainingRequests ?? '未返回'} 请求 / ${formatTokens(log.rateLimitRemainingTokens)} Token`))),
            React.createElement('div', { className: 'ph-logGroup' }, React.createElement('div', { className: 'ph-logGroupTitle' }, '计费'), React.createElement('div', { className: 'ph-logFacts' }, React.createElement('span', { className: 'ph-logFact ph-logCost' }, formatCost(log.cost, log.currency)), React.createElement('span', { className: 'ph-logFact' }, log.costSource === 'provider-reported' ? '供应商报告金额' : log.costSource === 'route-pricing' ? '按渠道模型单价估算' : '未配置模型单价')))),
          log.error && React.createElement('div', { className: 'ph-logError' }, `请求失败：${log.error}`)
        )))
      );
    }

    function Dashboard() {
      const hub = useHub();
      const [tab, setTab] = React.useState('providers');
      return React.createElement('div', { className: 'ph-dashboard' },
        React.createElement(GeneratedKeyNotice, { hub, service: hub.state?.service }),
        React.createElement(ServiceCard, { hub }),
        hub.error && React.createElement('div', { className: 'ph-error' }, hub.error),
        React.createElement('div', { className: 'ph-tabs' },
          React.createElement('button', { className: 'ph-tab', 'data-active': tab === 'providers', onClick: () => setTab('providers') }, '供应商'),
          React.createElement('button', { className: 'ph-tab', 'data-active': tab === 'accounts', onClick: () => setTab('accounts') }, '官方账号'),
          React.createElement('button', { className: 'ph-tab', 'data-active': tab === 'specs', onClick: () => { setTab('specs'); hub.refresh(); } }, '模型规格'),
          React.createElement('button', { className: 'ph-tab', 'data-active': tab === 'logs', onClick: () => { setTab('logs'); hub.refresh(); } }, `日志${hub.logs.length ? ` (${hub.logs.length})` : ''}`)
        ),
        hub.loading && !hub.state ? React.createElement('div', { className: 'ph-empty' }, '正在读取 Provider Hub…') : tab === 'providers' ? React.createElement(Channels, { hub }) : tab === 'accounts' ? React.createElement(AccountService, { hub }) : tab === 'specs' ? React.createElement(Specifications, { hub }) : React.createElement(Logs, { hub }),
        React.createElement('div', { className: 'ph-help' }, '自定义 API 渠道与内置官方账号统一进入优先级、保底、冷却和会话粘性路由。')
      );
    }

    function Workspace({ onClose }) {
      return React.createElement('main', { className: 'ph-workspace' }, React.createElement('div', { className: 'ph-workspaceInner' },
        React.createElement('header', { className: 'ph-workspaceBar' }, React.createElement('div', { className: 'ph-workspaceBrand' }, React.createElement('span', { className: 'ph-workspaceMark' }, React.createElement(ProviderHubIcon, { size: 20 })), React.createElement('div', null, React.createElement('h1', null, 'Provider Hub'), React.createElement('p', null, '多 API Key、模型白名单、官方账号、路由与日志'))), React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: onClose }, '返回对话')),
        React.createElement(Dashboard)
      ));
    }

    function mountProviderHubWorkspace() {
      const ACTIVE = 'data-dsh-provider-hub-active';
      const PANEL = 'provider-hub';
      let open = false;
      let entry;
      let container;
      let root;
      let sidebarRoot;
      const setOpen = (value) => {
        if (value && !open) {
          document.dispatchEvent(new CustomEvent('dsh-panel-activate', { detail: 'ssh' }));
          document.dispatchEvent(new CustomEvent('dsh-panel-activate', { detail: 'taskboard' }));
          document.documentElement.removeAttribute('data-dsh-taskboard-active');
          document.documentElement.removeAttribute('data-dsh-ssh-active');
          document.documentElement.removeAttribute('data-dsh-knowledge-summary-active');
          open = true;
          document.documentElement.setAttribute(ACTIVE, '');
          document.dispatchEvent(new CustomEvent('dsh-panel-activate', { detail: PANEL }));
        } else if (!value && open) {
          open = false;
          document.documentElement.removeAttribute(ACTIVE);
        }
        if (entry) { if (open) entry.dataset.active = 'true'; else delete entry.dataset.active; }
      };
      const ensureEntry = () => {
        const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
        const nextRoot = column?.querySelector('[class*="logoRow"]')?.parentElement || column?.firstElementChild;
        if (!nextRoot) return;
        sidebarRoot = nextRoot;
        if (!entry) {
          entry = document.createElement('button'); entry.type = 'button'; entry.className = 'ph-entry'; entry.dataset.dshProviderHubEntry = ''; entry.title = 'Provider Hub'; entry.setAttribute('aria-label', '打开 Provider Hub 页面'); entry.innerHTML = '<span class="ph-entryIcon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/></svg></span><span class="ph-entryLabel">Provider Hub</span>'; entry.addEventListener('click', () => setOpen(!open));
        }
        const taskboard = sidebarRoot.querySelector('[data-dsh-taskboard-entry]');
        const family = [...sidebarRoot.children].filter((element) => element instanceof HTMLElement && element.matches('[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-provider-hub-entry], [data-dsh-knowledge-summary-entry]'));
        const anchor = taskboard?.nextSibling || family[0] || sidebarRoot.querySelector('button[class*="newSession"]')?.parentElement?.nextSibling;
        if (entry.parentElement !== sidebarRoot || entry !== anchor) sidebarRoot.insertBefore(entry, anchor || null);
      };
      const ensureView = () => {
        if (container?.isConnected) return;
        root?.unmount(); container?.remove(); root = undefined; container = undefined;
        const center = document.querySelector('[data-pane="conversation"], [class*="centerCol"]');
        if (!center) return;
        container = document.createElement('div'); container.dataset.dshProviderHubView = ''; center.appendChild(container); root = createRoot(container); root.render(React.createElement(Workspace, { onClose: () => setOpen(false) }));
      };
      const observer = new MutationObserver(() => { ensureEntry(); ensureView(); });
      observer.observe(document.body, { childList: true, subtree: true }); ensureEntry(); ensureView();
      const onOtherPanel = (event) => { if (event.detail === 'taskboard' && !open) return; if (event.detail !== PANEL && open) setOpen(false); };
      const onSidebarContext = (event) => { if (open && event.target?.closest?.('[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]')) setOpen(false); };
      document.addEventListener('dsh-panel-activate', onOtherPanel); document.addEventListener('click', onSidebarContext, true);
      return () => { observer.disconnect(); document.removeEventListener('dsh-panel-activate', onOtherPanel); document.removeEventListener('click', onSidebarContext, true); setOpen(false); root?.unmount(); container?.remove(); entry?.remove(); };
    }

    module.exports.inject = ['connection'];
    module.exports.apply = (ctx) => {
      dshApi = ctx.connection.api;
      ctx.effect(() => { const style = document.createElement('style'); style.dataset.providerHub = 'true'; style.textContent = css; document.head.appendChild(style); return () => style.remove(); }, 'provider-hub: styles');
      ctx.effect(() => mountProviderHubWorkspace(), 'provider-hub: workspace');
    };
    return module.exports;
  }
});
