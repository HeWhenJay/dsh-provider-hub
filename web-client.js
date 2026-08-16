window.__ModuleLoader__.load({
  id: '@hewhenjay/dsh-cockpit-relay',
  factory: (require) => {
    const module = { exports: {} };
    const React = require('react');
    const {
      Button, Input, Modal, Pill, StateDot, Tooltip,
      IconApiOutline14, IconPlusOutline16, IconRefreshOutline16,
      IconTrashOutline16, IconPlayOutline16, IconPauseOutline16
    } = require('@deepseek-ai/dsh-client-ui-primitives');

    const NS = 'cockpit-relay';
    const css = `
      .cr-trigger{width:100%;display:flex;align-items:center;gap:10px;color:var(--dsw-alias-label-secondary);padding:8px 10px;border:0;background:transparent;border-radius:10px;cursor:pointer;font:inherit}.cr-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.cr-trigger.cr-rail{justify-content:center;padding:8px}.cr-dashboard{display:flex;flex-direction:column;gap:18px;min-width:0;color:var(--dsw-alias-label-primary)}.cr-modal{width:min(960px,calc(100vw - 32px));max-width:960px}.cr-modal-body{max-height:min(72vh,780px);overflow:auto}.cr-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}.cr-title{font-size:16px;font-weight:650;margin:0 0 5px}.cr-sub{font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.55}.cr-actions{display:flex;gap:8px;flex-wrap:wrap}.cr-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2)}.cr-tab{border:0;background:none;color:var(--dsw-alias-label-secondary);padding:9px 12px;cursor:pointer;border-bottom:2px solid transparent}.cr-tab[data-active=true]{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-business-primary)}.cr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cr-card{padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}.cr-route-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.cr-route-name{font-weight:600}.cr-meta{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:4px;word-break:break-all}.cr-models{display:flex;gap:5px;flex-wrap:wrap;margin:12px 0}.cr-model{font-size:11px;padding:3px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}.cr-row-actions{display:flex;gap:6px;justify-content:flex-end}.cr-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cr-field{display:flex;flex-direction:column;gap:6px}.cr-field.cr-wide{grid-column:1/-1}.cr-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}.cr-input{width:100%}.cr-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-secondary)}.cr-log{display:grid;grid-template-columns:132px 1fr 120px 70px 72px;gap:8px;align-items:center;padding:9px 4px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px}.cr-log-time,.cr-muted{color:var(--dsw-alias-label-tertiary)}.cr-error{padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary);font-size:13px}.cr-empty{text-align:center;padding:34px;color:var(--dsw-alias-label-tertiary);border:1px dashed var(--dsw-alias-border-l2);border-radius:12px}.cr-section-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.cr-section-title h3{font-size:14px;margin:0}.cr-status{display:flex;align-items:center;gap:7px}.cr-help{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.55}.cr-settings{padding:4px 2px 24px}.cr-spinner{animation:cr-spin 1s linear infinite}@keyframes cr-spin{to{transform:rotate(360deg)}}@media(max-width:720px){.cr-grid,.cr-form{grid-template-columns:1fr}.cr-field.cr-wide{grid-column:auto}.cr-hero{flex-direction:column}.cr-log{grid-template-columns:90px 1fr 55px}.cr-log-route,.cr-log-latency{display:none}}
    `;

    function api(path, init) {
      return fetch(`/api/cockpit-relay${path}`, { headers: { 'content-type': 'application/json', ...(init?.headers || {}) }, ...init }).then(async (response) => {
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
        return value;
      });
    }

    function useRelay() {
      const [state, setState] = React.useState(null);
      const [logs, setLogs] = React.useState([]);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const refresh = React.useCallback(async () => {
        setLoading(true); setError('');
        try {
          const [next, history] = await Promise.all([api('/state'), api('/logs')]);
          setState(next); setLogs(history.logs || []);
        } catch (reason) { setError(reason.message); }
        finally { setLoading(false); }
      }, []);
      React.useEffect(() => { refresh(); }, [refresh]);
      return { state, setState, logs, setLogs, loading, error, setError, refresh };
    }

    function ServiceCard({ relay }) {
      const service = relay.state?.service;
      const [saving, setSaving] = React.useState(false);
      const [editing, setEditing] = React.useState(false);
      if (!service) return null;
      const toggle = async () => {
        setSaving(true); relay.setError('');
        try { relay.setState(await api('/service', { method: 'PUT', body: JSON.stringify({ ...service, enabled: !service.enabled }) })); }
        catch (error) { relay.setError(error.message); }
        finally { setSaving(false); }
      };
      return React.createElement('div', { className: 'cr-hero' },
        React.createElement('div', null,
          React.createElement('div', { className: 'cr-status' },
            React.createElement(StateDot, { state: service.running ? 'done' : service.startError ? 'error' : 'warning' }),
            React.createElement('h2', { className: 'cr-title' }, service.running ? 'API 服务运行中' : service.enabled ? 'API 服务启动失败' : 'API 服务已关闭')
          ),
          React.createElement('div', { className: 'cr-sub' }, `${service.baseURL} · ${relay.state.routes.length} 个渠道 · 客户端密钥${service.keyConfigured ? '已配置' : '未配置'}`),
          service.startError && React.createElement('div', { className: 'cr-error', style: { marginTop: 10 } }, service.startError),
          service.startNotice && React.createElement('div', { className: 'cr-help', style: { marginTop: 8, color: 'var(--dsw-alias-state-warn-primary)' } }, service.startNotice)
        ),
        React.createElement('div', { className: 'cr-actions' },
          React.createElement(Button, { variant: service.enabled ? 'outline' : 'primary', size: 'sm', disabled: saving, icon: service.enabled ? React.createElement(IconPauseOutline16, { size: 16 }) : React.createElement(IconPlayOutline16, { size: 16 }), onClick: toggle }, service.enabled ? '关闭服务' : '开启服务'),
          React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: () => setEditing(true) }, '服务设置'),
          React.createElement(Button, { variant: 'ghost', size: 'sm', icon: React.createElement(IconRefreshOutline16, { size: 16 }), onClick: relay.refresh }, '刷新')
        ),
        editing && React.createElement(ServiceEditor, { service, onClose: () => setEditing(false), onSaved: relay.setState, setError: relay.setError })
      );
    }

    function ServiceEditor({ service, onClose, onSaved, setError }) {
      const [form, setForm] = React.useState({ ...service, apiKey: '' });
      const [saving, setSaving] = React.useState(false);
      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
      const save = async () => {
        setSaving(true); setError('');
        try { onSaved(await api('/service', { method: 'PUT', body: JSON.stringify({ ...form, port: Number(form.port) }) })); onClose(); }
        catch (error) { setError(error.message); }
        finally { setSaving(false); }
      };
      return React.createElement(Modal, { open: true, onClose, title: 'API 服务设置', closeLabel: '关闭服务设置', description: '默认仅本机访问。切换到局域网后必须配置客户端密钥。', footer: React.createElement(React.Fragment, null, React.createElement(Button, { variant: 'ghost', onClick: onClose }, '取消'), React.createElement(Button, { variant: 'primary', disabled: saving, onClick: save }, saving ? '保存中…' : '保存并重启')) },
        React.createElement('div', { className: 'cr-form' },
          field('监听范围', React.createElement('select', { value: form.host, onChange: set('host'), style: selectStyle }, React.createElement('option', { value: '127.0.0.1' }, '仅本机 127.0.0.1'), React.createElement('option', { value: '0.0.0.0' }, '可信局域网 0.0.0.0'))),
          field('端口', React.createElement(Input, { type: 'number', value: form.port, onChange: set('port') })),
          field('客户端密钥变量名', React.createElement(Input, { value: form.apiKeyEnv, onChange: set('apiKeyEnv') }), true),
          field('新的客户端访问密钥', React.createElement(Input, { type: 'password', value: form.apiKey, placeholder: service.keyConfigured ? '已配置；留空保持不变' : 'LAN 模式必须配置', onChange: set('apiKey') }), true)
        )
      );
    }

    const emptyRoute = { id: '', displayName: '', baseURL: '', api: 'openai-completions', apiKeyEnv: '', apiKey: '', priority: 100, backup: false, modelsText: '', modelAliasesText: '{}' };

    function RouteEditor({ route, onClose, onSaved, setError }) {
      const [form, setForm] = React.useState(() => route ? { ...route, apiKey: '', modelsText: (route.models || []).join(', '), modelAliasesText: JSON.stringify(route.modelAliases || {}, null, 2) } : emptyRoute);
      const [saving, setSaving] = React.useState(false);
      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
      const save = async () => {
        setSaving(true); setError('');
        try {
          let aliases;
          try { aliases = JSON.parse(form.modelAliasesText || '{}'); } catch { throw new Error('模型别名必须是有效 JSON'); }
          const next = await api('/routes', { method: 'POST', body: JSON.stringify({ ...form, priority: Number(form.priority), models: form.modelsText.split(',').map((x) => x.trim()).filter(Boolean), modelAliases: aliases }) });
          onSaved(next); onClose();
        } catch (error) { setError(error.message); }
        finally { setSaving(false); }
      };
      return React.createElement(Modal, { open: true, onClose, title: route ? '编辑渠道' : '添加账号 / API 渠道', closeLabel: '关闭渠道编辑', description: '支持中转站、官方 API Key，或 Cockpit sidecar 本地账号池。真实 API Key 只写入 DSH 本机凭据库。', className: 'cr-modal', contentClassName: 'cr-modal-body', footer: React.createElement(React.Fragment, null, React.createElement(Button, { variant: 'ghost', onClick: onClose }, '取消'), React.createElement(Button, { variant: 'primary', disabled: saving, onClick: save }, saving ? '保存中…' : '保存渠道')) },
        React.createElement('div', { className: 'cr-form' },
          field('渠道 ID', React.createElement(Input, { className: 'cr-input', value: form.id, disabled: Boolean(route), placeholder: 'cheap-a', onChange: set('id') })),
          field('显示名称', React.createElement(Input, { className: 'cr-input', value: form.displayName, placeholder: '低价中转站 A', onChange: set('displayName') })),
          field('Base URL', React.createElement(Input, { className: 'cr-input', value: form.baseURL, placeholder: 'https://example.com/v1', onChange: set('baseURL') }), true),
          field('凭据变量名', React.createElement(Input, { className: 'cr-input', value: form.apiKeyEnv, placeholder: 'CHEAP_A_KEY（可自动生成）', onChange: set('apiKeyEnv') })),
          field('API Key', React.createElement(Input, { className: 'cr-input', type: 'password', value: form.apiKey, placeholder: route?.keyConfigured ? '已配置；留空保持不变' : '输入后保存到 DSH 凭据库', onChange: set('apiKey') })),
          field('优先级', React.createElement(Input, { className: 'cr-input', type: 'number', value: form.priority, onChange: set('priority') })),
          field('协议', React.createElement('select', { value: form.api, onChange: set('api'), style: selectStyle }, React.createElement('option', { value: 'openai-completions' }, 'OpenAI Chat Completions'), React.createElement('option', { value: 'openai-responses' }, 'OpenAI Responses'))),
          field('模型列表（逗号分隔）', React.createElement(Input, { className: 'cr-input', value: form.modelsText, placeholder: 'gpt-4o-mini, deepseek-chat', onChange: set('modelsText') }), true),
          field('模型别名 JSON', React.createElement('textarea', { value: form.modelAliasesText, onChange: set('modelAliasesText'), rows: 4, style: textareaStyle }), true),
          React.createElement('label', { className: 'cr-check cr-wide' }, React.createElement('input', { type: 'checkbox', checked: form.backup, onChange: set('backup') }), '作为保底渠道：仅在普通渠道不可用时使用')
        )
      );
    }

    function field(label, child, wide) { return React.createElement('label', { className: `cr-field${wide ? ' cr-wide' : ''}` }, React.createElement('span', { className: 'cr-label' }, label), child); }
    const selectStyle = { height: 36, borderRadius: 9, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', padding: '0 10px' };
    const textareaStyle = { borderRadius: 9, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', padding: 10, resize: 'vertical', fontFamily: 'ui-monospace, monospace' };

    function Channels({ relay }) {
      const [editing, setEditing] = React.useState(null);
      const [testing, setTesting] = React.useState('');
      const remove = async (route) => {
        if (!confirm(`删除渠道“${route.displayName}”？为避免影响共享账号，已保存的 DSH 凭据会保留。`)) return;
        try { relay.setState(await api(`/routes/${encodeURIComponent(route.id)}`, { method: 'DELETE' })); }
        catch (error) { relay.setError(error.message); }
      };
      const test = async (route) => {
        setTesting(route.id); relay.setError('');
        try {
          const result = await api(`/routes/${encodeURIComponent(route.id)}/test`, { method: 'POST', body: JSON.stringify({ model: route.models?.[0] }) });
          alert(result.ok ? `测试成功 · HTTP ${result.status} · ${result.latencyMs}ms` : `测试失败 · HTTP ${result.status}\n${result.preview}`);
          relay.refresh();
        } catch (error) { relay.setError(error.message); }
        finally { setTesting(''); }
      };
      const routes = relay.state?.routes || [];
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'cr-section-title' }, React.createElement('div', null, React.createElement('h3', null, '账号与 API 渠道'), React.createElement('div', { className: 'cr-help' }, '高优先级渠道先用；保底渠道最后使用。')), React.createElement(Button, { variant: 'primary', size: 'sm', icon: React.createElement(IconPlusOutline16, { size: 16 }), onClick: () => setEditing(false) }, '添加账号')),
        routes.length === 0 ? React.createElement('div', { className: 'cr-empty' }, '还没有渠道。添加一个中转站、官方 API Key，或本地 Cockpit sidecar。') : React.createElement('div', { className: 'cr-grid' }, routes.map((route) => React.createElement('article', { className: 'cr-card', key: route.id },
          React.createElement('div', { className: 'cr-route-head' }, React.createElement('div', null, React.createElement('div', { className: 'cr-route-name' }, route.displayName), React.createElement('div', { className: 'cr-meta' }, route.baseURL)), React.createElement(Pill, { active: route.keyConfigured && !route.backup }, route.backup ? '保底' : route.keyConfigured ? '已配置' : '缺少 Key')),
          React.createElement('div', { className: 'cr-models' }, (route.models || []).slice(0, 5).map((model) => React.createElement('span', { className: 'cr-model', key: model }, model)), route.models?.length > 5 && React.createElement('span', { className: 'cr-model' }, `+${route.models.length - 5}`)),
          React.createElement('div', { className: 'cr-meta' }, `优先级 ${route.priority} · ${route.apiKeyEnv}`),
          React.createElement('div', { className: 'cr-row-actions' }, React.createElement(Button, { variant: 'ghost', size: 'sm', disabled: testing === route.id, onClick: () => test(route) }, testing === route.id ? '测试中…' : '测试'), React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: () => setEditing(route) }, '编辑'), React.createElement(Button, { variant: 'ghost', size: 'sm', icon: React.createElement(IconTrashOutline16, { size: 15 }), 'aria-label': '删除渠道', onClick: () => remove(route) }))
        ))),
        editing !== null && React.createElement(RouteEditor, { route: editing || undefined, onClose: () => setEditing(null), onSaved: relay.setState, setError: relay.setError })
      );
    }

    function Logs({ relay }) {
      const clear = async () => { await api('/logs', { method: 'DELETE' }); relay.setLogs([]); };
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'cr-section-title' }, React.createElement('div', null, React.createElement('h3', null, '请求日志'), React.createElement('div', { className: 'cr-help' }, '仅保留内存中的渠道、模型、状态和延迟；不记录 API Key 或提示词。')), React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: clear }, '清空')),
        relay.logs.length === 0 ? React.createElement('div', { className: 'cr-empty' }, '暂无请求日志。') : React.createElement('div', null, relay.logs.map((log) => React.createElement('div', { className: 'cr-log', key: log.id }, React.createElement('span', { className: 'cr-log-time' }, new Date(log.time).toLocaleTimeString()), React.createElement('span', null, log.model), React.createElement('span', { className: 'cr-log-route' }, log.routeName), React.createElement('span', { style: { color: log.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' } }, log.status || 'ERR'), React.createElement('span', { className: 'cr-log-latency cr-muted' }, `${log.latencyMs}ms`))))
      );
    }

    function Dashboard() {
      const relay = useRelay();
      const [tab, setTab] = React.useState('channels');
      return React.createElement('div', { className: 'cr-dashboard' },
        React.createElement(ServiceCard, { relay }),
        relay.error && React.createElement('div', { className: 'cr-error' }, relay.error),
        React.createElement('div', { className: 'cr-tabs' }, React.createElement('button', { className: 'cr-tab', 'data-active': tab === 'channels', onClick: () => setTab('channels') }, '账号与渠道'), React.createElement('button', { className: 'cr-tab', 'data-active': tab === 'logs', onClick: () => { setTab('logs'); relay.refresh(); } }, `日志${relay.logs.length ? ` (${relay.logs.length})` : ''}`)),
        relay.loading && !relay.state ? React.createElement('div', { className: 'cr-empty' }, '正在读取 Cockpit Relay…') : tab === 'channels' ? React.createElement(Channels, { relay }) : React.createElement(Logs, { relay }),
        React.createElement('div', { className: 'cr-help' }, 'OAuth 登录账号需先由完整 Cockpit sidecar 管理，再把其本地 OpenAI-compatible URL 作为渠道添加。')
      );
    }

    function SidebarButton({ wide }) {
      const [open, setOpen] = React.useState(false);
      return React.createElement(React.Fragment, null,
        React.createElement(Tooltip, { label: 'Cockpit Relay', disabled: wide, children: React.createElement('button', { type: 'button', className: `cr-trigger${wide ? '' : ' cr-rail'}`, onClick: () => setOpen(true), 'aria-label': '打开 Cockpit Relay' }, React.createElement(IconApiOutline14, { size: wide ? 14 : 18 }), wide && React.createElement('span', null, 'Cockpit Relay')) }),
        React.createElement(Modal, { open, onClose: () => setOpen(false), title: 'Cockpit Relay', closeLabel: '关闭 Cockpit Relay', description: '本地多账号与多中转站健康路由', className: 'cr-modal', contentClassName: 'cr-modal-body' }, React.createElement(Dashboard))
      );
    }

    function SettingsPage() { return React.createElement('div', { className: 'cr-settings' }, React.createElement(Dashboard)); }

    module.exports.inject = ['slots', 'locale'];
    module.exports.apply = (ctx) => {
      ctx.effect(() => { const style = document.createElement('style'); style.dataset.cockpitRelay = 'true'; style.textContent = css; document.head.appendChild(style); return () => style.remove(); }, 'cockpit-relay: styles');
      ctx.effect(() => ctx.locale.register(NS, { zh: { nav: 'Cockpit Relay' }, en: { nav: 'Cockpit Relay' } }), 'cockpit-relay: locale');
      const t = ctx.locale.bind(NS);
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'cockpit-relay', order: 40, label: () => t('nav'), locale: NS }, SidebarButton));
      ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'cockpit-relay', order: 40, label: () => t('nav'), locale: NS }, SettingsPage));
    };
    return module.exports;
  }
});
