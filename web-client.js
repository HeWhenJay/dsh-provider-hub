window.__ModuleLoader__.load({
  id: '@hewhenjay/dsh-provider-hub',
  factory: (require) => {
    const module = { exports: {} };
    const React = require('react');
    const {
      Button, Input, Menu, Modal, Pill, StateDot, Tooltip,
      IconApiOutline14, IconPlusOutline16, IconRefreshOutline16,
      IconTrashOutline16, IconPlayOutline16, IconPauseOutline16,
      IconChevronDownOutline14, IconGlobeOutline14, IconLinkOutline16,
      IconCheckOutline16, IconLoadingOutline16, IconBranchOutline16
    } = require('@deepseek-ai/dsh-client-ui-primitives');

    const NS = 'provider-hub';
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

    function markProviderHubSettingsIcon() {
      const rows = [...document.querySelectorAll('button')].filter((button) => button.textContent?.trim() === 'Provider Hub' && button.querySelector('svg'));
      for (const row of rows) {
        if (row.closest('[role="dialog"]')) row.dataset.providerHubSettingsNav = 'true';
      }
    }
    const css = `
      .ph-trigger{width:100%;display:flex;align-items:center;gap:10px;color:var(--dsw-alias-label-secondary);padding:8px 10px;border:0;background:transparent;border-radius:10px;cursor:pointer;font:inherit}.ph-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.ph-trigger.ph-rail{justify-content:center;padding:8px}.ph-trigger:focus-visible,.ph-tab:focus-visible,.ph-selectTrigger:focus-visible,.ph-check:focus-within{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.ph-dashboard{display:flex;flex-direction:column;gap:18px;min-width:0;color:var(--dsw-alias-label-primary)}.ph-modal{width:min(980px,calc(100vw - 32px));max-width:980px}.ph-modalBody{max-height:min(74vh,820px);overflow:auto}.ph-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}.ph-title{font-size:16px;font-weight:650;margin:0 0 5px}.ph-sub{font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.55}.ph-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ph-danger{color:var(--dsw-alias-state-error-primary)!important}button[data-provider-hub-settings-nav=true] svg{display:none}button[data-provider-hub-settings-nav=true]::before{content:"";width:16px;height:16px;flex:none;background:currentColor;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='16' y='16' width='6' height='6' rx='1' fill='none' stroke='black' stroke-width='2'/%3E%3Crect x='2' y='16' width='6' height='6' rx='1' fill='none' stroke='black' stroke-width='2'/%3E%3Crect x='9' y='2' width='6' height='6' rx='1' fill='none' stroke='black' stroke-width='2'/%3E%3Cpath d='M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat}.ph-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2)}.ph-tab{border:0;background:none;color:var(--dsw-alias-label-secondary);padding:9px 12px;cursor:pointer;border-bottom:2px solid transparent;font:inherit}.ph-tab[data-active=true]{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}.ph-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ph-card{padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}.ph-cardHead{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.ph-cardName{font-weight:600}.ph-meta{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:6px;line-height:1.5;overflow-wrap:anywhere}.ph-models{display:flex;gap:5px;flex-wrap:wrap;margin:12px 0}.ph-model{font-size:11px;padding:3px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}.ph-rowActions{display:flex;gap:4px;justify-content:flex-end;margin-top:10px}.ph-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ph-field{display:flex;flex-direction:column;gap:6px;min-width:0}.ph-wide{grid-column:1/-1}.ph-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}.ph-hint,.ph-help{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5}.ph-control{width:100%}.ph-textarea,.ph-selectTrigger{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit}.ph-textarea{min-height:84px;padding:9px 10px;resize:vertical;line-height:1.5}.ph-textarea:hover,.ph-selectTrigger:hover{border-color:var(--dsw-alias-border-l1)}.ph-textarea:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-color:transparent}.ph-select{display:block;width:100%}.ph-select>[role=menu]{box-sizing:border-box;width:100%;min-width:100%;max-width:none}.ph-selectTrigger{height:36px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;text-align:left}.ph-selectTrigger[data-open=true]{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-color:transparent}.ph-check{display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:13px;line-height:18px}.ph-check input{position:absolute;opacity:0;pointer-events:none}.ph-checkBox{width:16px;height:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;display:flex;align-items:center;justify-content:center;color:transparent;margin-top:1px}.ph-check input:checked+.ph-checkBox{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:white}.ph-sectionTitle{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:2px}.ph-sectionTitle h3{margin:0 0 4px;font-size:14px}.ph-empty{padding:30px 14px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-tertiary)}.ph-error{padding:10px 12px;border-radius:9px;background:var(--dsw-alias-state-error-bg);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}.ph-status{display:flex;align-items:center;gap:8px}.ph-discovery{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2)}.ph-discoveryText{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}.ph-providerButtons{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l2)}.ph-account{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l2)}.ph-account:first-child{margin-top:10px}.ph-accountInfo{min-width:0}.ph-log{display:grid;grid-template-columns:84px minmax(120px,1fr) minmax(100px,.8fr) 52px 62px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px}.ph-logTime,.ph-logRoute,.ph-muted{color:var(--dsw-alias-label-tertiary)}.ph-logRoute{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ph-logLatency{text-align:right}.ph-accountCard{display:flex;flex-direction:column;gap:2px}.ph-accountCard>.ph-cardHead{padding-bottom:2px}.ph-spin{animation:ph-spin 1s linear infinite}@keyframes ph-spin{to{transform:rotate(360deg)}}@media(max-width:720px){.ph-grid,.ph-form{grid-template-columns:1fr}.ph-wide{grid-column:auto}.ph-hero,.ph-sectionTitle{flex-direction:column}.ph-log{grid-template-columns:72px minmax(90px,1fr) 50px 52px}.ph-logRoute{display:none}}
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
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const refresh = React.useCallback(async () => {
        setLoading(true); setError('');
        try { const [next, history] = await Promise.all([hubApi('/state'), hubApi('/logs')]); setState(next); setLogs(history.logs || []); }
        catch (reason) { setError(reason.message); }
        finally { setLoading(false); }
      }, []);
      React.useEffect(() => { refresh(); }, [refresh]);
      return { state, setState, logs, setLogs, loading, error, setError, refresh };
    }

    function Field({ label, hint, wide, children }) {
      return React.createElement('label', { className: `ph-field${wide ? ' ph-wide' : ''}` }, React.createElement('span', { className: 'ph-label' }, label), children, hint && React.createElement('span', { className: 'ph-hint' }, hint));
    }
    function TextInput(props) { return React.createElement(Input, { ...props, className: `ph-control${props.className ? ` ${props.className}` : ''}` }); }
    function Checkbox({ checked, onChange, children, wide }) {
      return React.createElement('label', { className: `ph-check${wide ? ' ph-wide' : ''}` }, React.createElement('input', { type: 'checkbox', checked, onChange }), React.createElement('span', { className: 'ph-checkBox' }, React.createElement(IconCheckOutline16, { size: 12 })), React.createElement('span', null, children));
    }
    function Dropdown({ value, options, onChange, label }) {
      const [open, setOpen] = React.useState(false);
      const current = options.find((item) => item.id === value);
      return React.createElement(Menu, { open, portal: false, dense: true, className: 'ph-select', items: options, selectedId: value, onSelect: (id) => { onChange(id); setOpen(false); }, onClose: () => setOpen(false), anchor: React.createElement('button', { type: 'button', className: 'ph-selectTrigger', 'data-open': open, 'aria-label': label, 'aria-expanded': open, onClick: () => setOpen((currentOpen) => !currentOpen) }, React.createElement('span', null, current?.label || value), React.createElement(IconChevronDownOutline14, { size: 14 })) });
    }

    function ServiceCard({ hub }) {
      const service = hub.state?.service;
      const [saving, setSaving] = React.useState(false);
      const [editing, setEditing] = React.useState(false);
      if (!service) return null;
      const toggle = async () => { setSaving(true); hub.setError(''); try { hub.setState(await hubApi('/service', { method: 'PUT', body: JSON.stringify({ ...service, enabled: !service.enabled }) })); } catch (error) { hub.setError(error.message); } finally { setSaving(false); } };
      return React.createElement('div', { className: 'ph-hero' },
        React.createElement('div', null,
          React.createElement('div', { className: 'ph-status' }, React.createElement(StateDot, { state: service.running ? 'done' : service.startError ? 'error' : 'warning' }), React.createElement('h2', { className: 'ph-title' }, service.running ? 'Provider Hub 运行中' : service.enabled ? 'Provider Hub 启动失败' : 'Provider Hub 已关闭')),
          React.createElement('div', { className: 'ph-sub' }, `${service.baseURL} · ${hub.state.routes.length} 个自定义渠道 · 客户端密钥${service.keyConfigured ? '已配置' : '未配置'}`),
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

    const emptyRoute = { id: '', displayName: '', baseURL: '', api: 'openai-completions', apiKeyEnv: '', apiKey: '', priority: 100, backup: false, modelsText: '', modelAliasesText: '{}' };
    function RouteEditor({ route, onClose, onSaved, setError }) {
      const [form, setForm] = React.useState(() => route ? { ...route, apiKey: '', modelsText: (route.models || []).join(', '), modelAliasesText: JSON.stringify(route.modelAliases || {}, null, 2) } : emptyRoute);
      const [saving, setSaving] = React.useState(false);
      const [discovering, setDiscovering] = React.useState(false);
      const [discovery, setDiscovery] = React.useState('');
      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
      const discover = async () => {
        setDiscovering(true); setDiscovery(''); setError('');
        const request = { settingsNs: 'llm-pi-ai', baseURL: form.baseURL, api: form.api, ...(form.apiKey ? { apiKey: form.apiKey } : {}) };
        try {
          let models;
          let source = 'DSH';
          if (dshApi?.llm?.discoverModels) { const response = await dshApi.llm.discoverModels(request); if (response.result.ok) models = response.result.value.models; }
          if (!models?.length) { const fallback = await hubApi('/models/discover', { method: 'POST', body: JSON.stringify(form) }); models = fallback.models; source = '供应商端点'; }
          const ids = [...new Set(models.map((item) => item.id).filter(Boolean))];
          setForm((current) => ({ ...current, modelsText: ids.join(', ') }));
          setDiscovery(`已从${source}获取 ${ids.length} 个模型，保存渠道后生效。`);
        } catch (error) { setError(error.message); } finally { setDiscovering(false); }
      };
      const save = async () => { setSaving(true); setError(''); try { let aliases; try { aliases = JSON.parse(form.modelAliasesText || '{}'); } catch { throw new Error('模型别名必须是有效 JSON'); } const next = await hubApi('/routes', { method: 'POST', body: JSON.stringify({ ...form, priority: Number(form.priority), models: form.modelsText.split(',').map((item) => item.trim()).filter(Boolean), modelAliases: aliases }) }); onSaved(next); onClose(); } catch (error) { setError(error.message); } finally { setSaving(false); } };
      return React.createElement(Modal, { open: true, onClose, title: route ? '编辑供应商渠道' : '添加供应商渠道', closeLabel: '关闭渠道编辑', description: '可直接配置官方 API、中转站或任意 OpenAI-compatible 服务。', className: 'ph-modal', contentClassName: 'ph-modalBody', footer: React.createElement(React.Fragment, null, React.createElement(Button, { variant: 'ghost', onClick: onClose }, '取消'), React.createElement(Button, { variant: 'primary', disabled: saving, onClick: save }, saving ? '保存中…' : '保存渠道')) },
        React.createElement('div', { className: 'ph-form' },
          React.createElement(Field, { label: '渠道 ID', hint: '保存后不可修改。' }, React.createElement(TextInput, { value: form.id, disabled: Boolean(route), placeholder: 'openai-official', onChange: set('id') })),
          React.createElement(Field, { label: '显示名称' }, React.createElement(TextInput, { value: form.displayName, placeholder: 'OpenAI 官方', onChange: set('displayName') })),
          React.createElement(Field, { label: 'Base URL', hint: '通常填写到 /v1；模型发现会自动请求 /models。', wide: true }, React.createElement(TextInput, { value: form.baseURL, placeholder: 'https://api.openai.com/v1', onChange: set('baseURL') })),
          React.createElement(Field, { label: '凭据变量名' }, React.createElement(TextInput, { value: form.apiKeyEnv, placeholder: 'OPENAI_API_KEY（可自动生成）', onChange: set('apiKeyEnv') })),
          React.createElement(Field, { label: 'API Key', hint: '只写入 DSH credentials。' }, React.createElement(TextInput, { type: 'password', value: form.apiKey, placeholder: route?.keyConfigured ? '已配置；留空保持不变' : '输入供应商 API Key', onChange: set('apiKey') })),
          React.createElement(Field, { label: '优先级' }, React.createElement(TextInput, { type: 'number', value: form.priority, onChange: set('priority') })),
          React.createElement(Field, { label: '协议' }, React.createElement(Dropdown, { value: form.api, label: '供应商协议', options: [{ id: 'openai-completions', label: 'OpenAI Chat Completions' }, { id: 'openai-responses', label: 'OpenAI Responses' }], onChange: (api) => setForm((current) => ({ ...current, api })) })),
          React.createElement('div', { className: 'ph-field ph-wide' }, React.createElement('div', { className: 'ph-discovery' }, React.createElement('div', { className: 'ph-discoveryText' }, React.createElement('strong', null, '供应商模型目录'), React.createElement('br'), discovery || '复用 DSH 的模型发现能力；失败时使用已保存凭据直接读取供应商目录。'), React.createElement(Button, { variant: 'outline', size: 'sm', disabled: discovering || !form.baseURL, icon: discovering ? React.createElement(IconLoadingOutline16, { size: 16, className: 'ph-spin' }) : React.createElement(IconRefreshOutline16, { size: 16 }), onClick: discover }, discovering ? '获取中…' : '获取全部模型'))),
          React.createElement(Field, { label: '模型列表', hint: '可一键获取，也可手动增删，逗号分隔。', wide: true }, React.createElement('textarea', { className: 'ph-textarea', value: form.modelsText, placeholder: 'gpt-4.1, claude-sonnet-4, gemini-2.5-pro', onChange: set('modelsText') })),
          React.createElement(Field, { label: '模型别名 JSON', hint: '本地模型 ID 到上游模型 ID 的映射。', wide: true }, React.createElement('textarea', { className: 'ph-textarea', value: form.modelAliasesText, onChange: set('modelAliasesText') })),
          React.createElement(Checkbox, { checked: form.backup, wide: true, onChange: (event) => setForm((current) => ({ ...current, backup: event.target.checked })) }, '作为保底渠道：仅在普通渠道不可用时使用')
        )
      );
    }

    function Channels({ hub }) {
      const [editing, setEditing] = React.useState(null);
      const [testing, setTesting] = React.useState('');
      const [deleting, setDeleting] = React.useState(null);
      const test = async (route) => { setTesting(route.id); hub.setError(''); try { const result = await hubApi(`/routes/${encodeURIComponent(route.id)}/test`, { method: 'POST', body: JSON.stringify({ model: route.models?.[0] }) }); hub.setError(result.ok ? '' : `测试失败：HTTP ${result.status} ${result.preview || ''}`); hub.refresh(); } catch (error) { hub.setError(error.message); } finally { setTesting(''); } };
      const remove = async () => { try { hub.setState(await hubApi(`/routes/${encodeURIComponent(deleting.id)}`, { method: 'DELETE' })); setDeleting(null); } catch (error) { hub.setError(error.message); } };
      const routes = hub.state?.routes || [];
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'ph-sectionTitle' }, React.createElement('div', null, React.createElement('h3', null, '供应商与 API 渠道'), React.createElement('div', { className: 'ph-help' }, '高优先级渠道先用，保底渠道最后使用；模型可一键发现。')), React.createElement(Button, { variant: 'primary', size: 'sm', icon: React.createElement(IconPlusOutline16, { size: 16 }), onClick: () => setEditing(false) }, '添加供应商')),
        routes.length === 0 ? React.createElement('div', { className: 'ph-empty' }, '还没有自定义渠道。可添加官方 API、中转站或本地模型网关；官方账号渠道由“账号服务”自动管理。') : React.createElement('div', { className: 'ph-grid' }, routes.map((route) => React.createElement('article', { className: 'ph-card', key: route.id },
          React.createElement('div', { className: 'ph-cardHead' }, React.createElement('div', null, React.createElement('div', { className: 'ph-cardName' }, route.displayName), React.createElement('div', { className: 'ph-meta' }, route.baseURL)), React.createElement(Pill, { active: route.keyConfigured && !route.backup }, route.backup ? '保底' : route.keyConfigured ? '已配置' : '免 Key / 未配置')),
          React.createElement('div', { className: 'ph-models' }, (route.models || []).slice(0, 5).map((model) => React.createElement('span', { className: 'ph-model', key: model }, model)), route.models?.length > 5 && React.createElement('span', { className: 'ph-model' }, `+${route.models.length - 5}`)),
          React.createElement('div', { className: 'ph-meta' }, `优先级 ${route.priority} · ${route.models?.length || 0} 个模型 · ${route.apiKeyEnv}`),
          React.createElement('div', { className: 'ph-rowActions' }, React.createElement(Button, { variant: 'ghost', size: 'sm', disabled: testing === route.id || !route.models?.length, onClick: () => test(route) }, testing === route.id ? '测试中…' : '测试'), React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: () => setEditing(route) }, '编辑'), React.createElement(Button, { variant: 'ghost', size: 'sm', icon: React.createElement(IconTrashOutline16, { size: 15 }), 'aria-label': '删除渠道', onClick: () => setDeleting(route) }))
        ))),
        editing !== null && React.createElement(RouteEditor, { route: editing || undefined, onClose: () => setEditing(null), onSaved: hub.setState, setError: hub.setError }),
        deleting && React.createElement(Modal, { open: true, onClose: () => setDeleting(null), title: '删除供应商渠道', description: `确定删除“${deleting.displayName}”？已保存的 DSH 凭据会保留，避免影响共享账号。`, footer: React.createElement(React.Fragment, null, React.createElement(Button, { variant: 'ghost', onClick: () => setDeleting(null) }, '取消'), React.createElement(Button, { variant: 'outline', onClick: remove }, '删除渠道')) })
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

    function Logs({ hub }) {
      const clear = async () => { await hubApi('/logs', { method: 'DELETE' }); hub.setLogs([]); };
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'ph-sectionTitle' }, React.createElement('div', null, React.createElement('h3', null, '请求日志'), React.createElement('div', { className: 'ph-help' }, '仅保留内存中的渠道、模型、状态和延迟；不记录 API Key、提示词或完整 URL。')), React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: clear }, '清空')),
        hub.logs.length === 0 ? React.createElement('div', { className: 'ph-empty' }, '暂无请求日志。') : React.createElement('div', null, hub.logs.map((log) => React.createElement('div', { className: 'ph-log', key: log.id }, React.createElement('span', { className: 'ph-logTime' }, new Date(log.time).toLocaleTimeString()), React.createElement('span', null, log.model), React.createElement('span', { className: 'ph-logRoute' }, log.routeName), React.createElement('span', { style: { color: log.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' } }, log.status || 'ERR'), React.createElement('span', { className: 'ph-logLatency ph-muted' }, `${log.latencyMs}ms`))))
      );
    }

    function Dashboard() {
      const hub = useHub();
      const [tab, setTab] = React.useState('providers');
      return React.createElement('div', { className: 'ph-dashboard' },
        React.createElement(ServiceCard, { hub }),
        hub.error && React.createElement('div', { className: 'ph-error' }, hub.error),
        React.createElement('div', { className: 'ph-tabs' },
          React.createElement('button', { className: 'ph-tab', 'data-active': tab === 'providers', onClick: () => setTab('providers') }, '供应商'),
          React.createElement('button', { className: 'ph-tab', 'data-active': tab === 'accounts', onClick: () => setTab('accounts') }, '官方账号'),
          React.createElement('button', { className: 'ph-tab', 'data-active': tab === 'logs', onClick: () => { setTab('logs'); hub.refresh(); } }, `日志${hub.logs.length ? ` (${hub.logs.length})` : ''}`)
        ),
        hub.loading && !hub.state ? React.createElement('div', { className: 'ph-empty' }, '正在读取 Provider Hub…') : tab === 'providers' ? React.createElement(Channels, { hub }) : tab === 'accounts' ? React.createElement(AccountService, { hub }) : React.createElement(Logs, { hub }),
        React.createElement('div', { className: 'ph-help' }, '自定义 API 渠道与内置官方账号统一进入优先级、保底、冷却和会话粘性路由。')
      );
    }

    function SidebarButton({ wide }) {
      const [open, setOpen] = React.useState(false);
      return React.createElement(React.Fragment, null,
        React.createElement(Tooltip, { label: 'Provider Hub', disabled: wide, children: React.createElement('button', { type: 'button', className: `ph-trigger${wide ? '' : ' ph-rail'}`, onClick: () => setOpen(true), 'aria-label': '打开 Provider Hub' }, React.createElement(IconApiOutline14, { size: wide ? 14 : 18 }), wide && React.createElement('span', null, 'Provider Hub')) }),
        React.createElement(Modal, { open, onClose: () => setOpen(false), title: 'DSH Provider Hub', closeLabel: '关闭 Provider Hub', description: '多供应商模型发现、官方账号、凭据、路由、故障切换与日志', className: 'ph-modal', contentClassName: 'ph-modalBody' }, React.createElement(Dashboard))
      );
    }
    function SettingsPage() { return React.createElement('div', { className: 'ph-settings' }, React.createElement(Dashboard)); }

    module.exports.inject = ['slots', 'locale', 'connection'];
    module.exports.apply = (ctx) => {
      dshApi = ctx.connection.api;
      ctx.effect(() => { const style = document.createElement('style'); style.dataset.providerHub = 'true'; style.textContent = css; document.head.appendChild(style); return () => style.remove(); }, 'provider-hub: styles');
      ctx.effect(() => {
        markProviderHubSettingsIcon();
        const observer = new MutationObserver(markProviderHubSettingsIcon);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
      }, 'provider-hub: settings icon');
      ctx.effect(() => ctx.locale.register(NS, { zh: { nav: 'Provider Hub' }, en: { nav: 'Provider Hub' } }), 'provider-hub: locale');
      const t = ctx.locale.bind(NS);
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'provider-hub', order: 40, label: () => t('nav'), locale: NS }, SidebarButton));
      ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'provider-hub', order: 40, label: () => t('nav'), icon: ProviderHubIcon, locale: NS }, SettingsPage));
    };
    return module.exports;
  }
});
