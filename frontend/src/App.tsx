import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth';

interface ToolActivity {
  id: string;
  name: string;
  label: string;
  input?: unknown;
  result?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolActivity[];
  notices?: string[];
}

interface PendingTool {
  tool_use_id: string;
  name: string;
  label: string;
  input: unknown;
}

interface ModelDef {
  id: string;
  label: string;
  priceInPerMTok?: number;
  priceOutPerMTok?: number;
}

function modelLabel(m: ModelDef): string {
  if (m.priceInPerMTok == null || m.priceOutPerMTok == null) return m.label;
  return `${m.label} ($${m.priceInPerMTok}/$${m.priceOutPerMTok} per MTok)`;
}

interface ProviderCat {
  id: string;
  label: string;
  configured: boolean;
  models: ModelDef[];
}

interface BillingInfo {
  provider: string;
  label: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
}

interface SkillFormState {
  mode: 'create' | 'edit';
  id?: string;
  name: string;
  description: string;
  body: string;
}

type Segment = { type: 'text'; text: string } | { type: 'code'; code: string };

function parseContent(content: string): Segment[] {
  const segments: Segment[] = [];
  const re = /```(?:\w+)?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      const t = content.slice(last, m.index).trim();
      if (t) segments.push({ type: 'text', text: t });
    }
    segments.push({ type: 'code', code: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    const tail = content.slice(last).trim();
    if (tail) segments.push({ type: 'text', text: tail });
  }
  return segments;
}

function Badge({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        border: '1px solid var(--clr-border)',
        background: 'var(--clr-surface)',
        padding: '2px 10px',
        fontSize: 11,
        color: muted ? 'var(--clr-muted)' : 'var(--clr-text)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: muted ? 'var(--clr-muted)' : 'var(--clr-primary)' }} />
      {label}
    </span>
  );
}

const selectStyle: React.CSSProperties = {
  borderRadius: 8,
  border: '1px solid var(--clr-border)',
  background: 'var(--clr-surface)',
  color: 'var(--clr-text)',
  padding: '4px 6px',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  maxWidth: 150,
};

const preStyle: React.CSSProperties = {
  overflowX: 'auto',
  margin: 0,
  padding: '8px 10px',
  borderRadius: 8,
  background: '#0e1420',
  color: '#dbe4f0',
  fontSize: 11.5,
  fontFamily: "'SF Mono','Menlo',monospace",
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function ToolRow({ activity }: { activity: ToolActivity }) {
  const [open, setOpen] = useState(false);
  const running = activity.result === undefined;
  return (
    <div style={{ border: '1px solid var(--clr-border)', borderRadius: 10, background: 'var(--clr-surface)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span className={running ? 'chat-dot-pulse' : undefined} style={{ width: 6, height: 6, borderRadius: 999, background: running ? 'var(--clr-primary)' : '#9fb0c6' }} />
        <span style={{ fontSize: 12, color: 'var(--clr-muted)' }}>{activity.label}</span>
        <code style={{ fontSize: 11, color: 'var(--clr-text)' }}>{activity.name}</code>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--clr-muted)' }}>{open ? '▲ hide' : '▼ details'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 10px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--clr-muted)', margin: '2px 0 3px' }}>arguments</div>
          <pre style={preStyle}>{JSON.stringify(activity.input ?? {}, null, 2)}</pre>
          {activity.result !== undefined && (
            <>
              <div style={{ fontSize: 10, color: 'var(--clr-muted)', margin: '8px 0 3px' }}>result</div>
              <pre style={preStyle}>{prettyJson(activity.result)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Bubble({ msg, onSaveAsSkill }: { msg: Message; onSaveAsSkill?: () => void }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ maxWidth: '85%', borderRadius: 14, borderTopRightRadius: 4, background: 'var(--clr-primary)', color: '#fff', padding: '9px 13px', fontSize: 14, whiteSpace: 'pre-wrap' }}>
          {msg.content}
        </div>
      </div>
    );
  }
  const segments = msg.content ? parseContent(msg.content) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {msg.toolCalls.map((t) => <ToolRow key={t.id} activity={t} />)}
        </div>
      )}
      {msg.toolCalls && msg.toolCalls.length > 0 && onSaveAsSkill && (
        <div>
          <button
            onClick={onSaveAsSkill}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 999,
              border: '1px solid var(--clr-border)',
              background: 'var(--clr-surface)',
              padding: '2px 10px',
              fontSize: 11,
              color: 'var(--clr-muted)',
              cursor: 'pointer',
            }}
          >
            💾 Save as skill
          </button>
        </div>
      )}
      {msg.notices && msg.notices.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {msg.notices.map((n, i) => <Badge key={`n${i}`} label={n} muted />)}
        </div>
      )}
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <div key={i} style={{ maxWidth: '92%', borderRadius: 14, borderTopLeftRadius: 4, border: '1px solid var(--clr-border)', background: 'var(--clr-surface)', padding: '9px 13px', fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {seg.text}
          </div>
        ) : (
          <pre key={i} style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--clr-border)', background: '#0e1420', color: '#dbe4f0', padding: '11px 13px', fontSize: 12.5, fontFamily: "'SF Mono','Menlo',monospace", margin: 0 }}>
            {seg.code}
          </pre>
        ),
      )}
    </div>
  );
}

const BILLING_URL: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/billing',
  openai: 'https://platform.openai.com/settings/organization/billing',
};

function InsertCoinCard({ info, onDismiss }: { info: BillingInfo; onDismiss: () => void }) {
  const label = info.label || 'provider';
  return (
    <div
      style={{
        border: '2px solid #f5c518',
        borderRadius: 12,
        background: '#0e1420',
        color: '#f5c518',
        padding: '20px 18px',
        textAlign: 'center',
        fontFamily: "'SF Mono','Menlo',monospace",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>▮ GAME OVER ▮</div>
      <div className="chat-blink" style={{ fontSize: 15, marginTop: 8, letterSpacing: 1 }}>
        INSERT COIN TO CONTINUE
      </div>
      <p style={{ fontSize: 12, color: '#9fb0c6', margin: '12px 0 16px', fontFamily: 'inherit', lineHeight: 1.5 }}>
        The {label} credit balance is empty, so the assistant can't reply.
        Add credit, then try your message again.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <a
          href={BILLING_URL[info.provider] ?? BILLING_URL.anthropic}
          target="_blank"
          rel="noreferrer"
          style={{ padding: '8px 16px', borderRadius: 8, background: '#f5c518', color: '#0e1420', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
        >
          Add credit ↗
        </a>
        <button
          onClick={onDismiss}
          style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', color: '#f5c518', border: '1px solid #f5c518', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ConfirmCard({ tools, onDecide, busy }: { tools: PendingTool[]; onDecide: (a: boolean) => void; busy: boolean }) {
  return (
    <div style={{ border: '1px solid var(--clr-write)', borderRadius: 12, background: '#fff8f0', padding: '12px 14px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-write)', marginBottom: 8 }}>
        ⚠ This will modify the catalogue — approve to proceed
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {tools.map((t) => (
          <div key={t.tool_use_id}>
            <code style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</code>
            <pre style={{ overflowX: 'auto', margin: '4px 0 0', padding: '8px 10px', borderRadius: 8, background: '#0e1420', color: '#dbe4f0', fontSize: 12, fontFamily: "'SF Mono','Menlo',monospace" }}>
              {JSON.stringify(t.input, null, 2)}
            </pre>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onDecide(true)} disabled={busy} style={{ border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--clr-write)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>
          Approve &amp; run
        </button>
        <button onClick={() => onDecide(false)} disabled={busy} style={{ borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>
          Reject
        </button>
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  borderRadius: 8,
  border: '1px solid var(--clr-border)',
  background: 'var(--clr-bg)',
  color: 'var(--clr-text)',
  padding: '6px 8px',
  fontSize: 13,
  fontFamily: 'inherit',
  width: '100%',
};

function SkillFormCard({
  form,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  form: SkillFormState;
  onChange: (f: SkillFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ border: '1px solid var(--clr-border)', borderRadius: 12, background: 'var(--clr-surface)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{form.mode === 'create' ? '💾 Save as skill' : '✎ Edit skill'}</div>
      <input
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        placeholder="Name (e.g. update-temporal-extent)"
        style={fieldStyle}
      />
      <input
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        placeholder="One-line description"
        style={fieldStyle}
      />
      <textarea
        value={form.body}
        onChange={(e) => onChange({ ...form, body: e.target.value })}
        placeholder="Full instructions the assistant should follow next time"
        rows={6}
        style={{ ...fieldStyle, resize: 'vertical', fontFamily: "'SF Mono','Menlo',monospace", fontSize: 12 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onSave}
          disabled={busy || !form.name.trim() || !form.description.trim() || !form.body.trim()}
          style={{ border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--clr-primary)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{ borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: 'var(--clr-text)', background: 'var(--clr-bg)', border: '1px solid var(--clr-border)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SkillCard({ skill, onEdit, onDelete }: { skill: Skill; onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={{ border: '1px solid var(--clr-border)', borderRadius: 10, background: 'var(--clr-surface)', padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, overflowWrap: 'break-word' }}>{skill.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--clr-muted)', marginTop: 2 }}>{skill.description}</div>
        </div>
        <button
          onClick={onEdit}
          title="Edit"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: 2, lineHeight: 1 }}
        >
          ✎
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: 2, lineHeight: 1 }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [pending, setPending] = useState<PendingTool[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [providers, setProviders] = useState<ProviderCat[]>([]);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillForm, setSkillForm] = useState<SkillFormState | null>(null);
  const [skillBusy, setSkillBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Latest history is captured via a ref so resume uses the freshest value.
  const historyRef = useRef<unknown[]>([]);
  const { user, signOut, getToken } = useAuth();

  // fetch with a fresh Firebase ID token on the Authorization header.
  async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getToken();
    return fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  }

  function refreshSkills() {
    authFetch('/api/skills')
      .then((r) => r.json())
      .then((d) => setSkills(d.skills ?? []))
      .catch(() => {
        /* sidebar just stays empty */
      });
  }

  useEffect(() => {
    authFetch('/api/mcp-tools')
      .then((r) => r.json())
      .then((d) => setStatus(d.connected ? `Catalogue connected — ${d.count} tools` : 'Catalogue tools unavailable'))
      .catch(() => setStatus('Catalogue tools unavailable'));
    refreshSkills();
    authFetch('/api/models')
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers ?? []);
        setProvider(d.defaultProvider ?? d.providers?.[0]?.id ?? '');
        setModel(d.defaultModel ?? '');
      })
      .catch(() => {
        /* pickers stay empty; chat falls back to the server default */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentModels = providers.find((p) => p.id === provider)?.models ?? [];

  /** Switch model within the same provider — history stays compatible. */
  function changeModel(next: string) {
    if (next === model) return;
    setModel(next);
  }

  /** Switch provider — message formats differ, so start a fresh conversation. */
  function changeProvider(next: string) {
    if (next === provider) return;
    const p = providers.find((x) => x.id === next);
    if (!p || !p.configured) return;
    if (messages.length > 0 && !window.confirm('Switching provider starts a new conversation. Continue?')) return;
    setProvider(next);
    setModel(p.models[0]?.id ?? '');
    setMessages([]);
    setHistory([]);
    historyRef.current = [];
    setPending(null);
    setBilling(null);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, pending]);

  const patchLast = (fn: (m: Message) => Message) =>
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });

  async function runStream(body: unknown) {
    const res = await authFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(body as object), provider, model }),
    });
    if (!res.ok || !res.body) {
      patchLast((m) => ({ ...m, content: m.content + `\n[Error ${res.status}: ${res.statusText}]` }));
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        switch (ev.type) {
          case 'content_delta':
            patchLast((m) => ({ ...m, content: m.content + (ev.text as string) }));
            break;
          case 'tool_call':
            patchLast((m) => ({
              ...m,
              toolCalls: [
                ...(m.toolCalls ?? []),
                { id: ev.id as string, name: ev.name as string, label: ev.label as string, input: ev.input },
              ],
            }));
            break;
          case 'tool_result':
            patchLast((m) => ({
              ...m,
              toolCalls: (m.toolCalls ?? []).map((t) =>
                t.id === (ev.id as string) ? { ...t, result: ev.preview as string } : t,
              ),
            }));
            break;
          case 'notice':
            patchLast((m) => ({ ...m, notices: [...(m.notices ?? []), ev.message as string] }));
            break;
          case 'confirm':
            setPending(ev.tools as PendingTool[]);
            break;
          case 'billing':
            setBilling({ provider: (ev.provider as string) ?? provider, label: (ev.label as string) ?? '' });
            break;
          case 'history':
            setHistory(ev.messages as unknown[]);
            historyRef.current = ev.messages as unknown[];
            break;
          case 'error':
            patchLast((m) => ({ ...m, content: m.content + `\n[Error: ${ev.message as string}]` }));
            break;
        }
      }
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || pending) return;
    setInput('');
    setBilling(null);
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '', toolCalls: [], notices: [] }]);
    setLoading(true);
    try {
      await runStream({ message: text, history });
    } catch (err) {
      patchLast((m) => ({ ...m, content: m.content + `\n[Error: ${String(err)}]` }));
    } finally {
      setLoading(false);
    }
  }

  async function decide(approve: boolean) {
    if (!pending || loading) return;
    const decisions = pending.map((t) => ({ tool_use_id: t.tool_use_id, approve }));
    setPending(null);
    setLoading(true);
    try {
      await runStream({ history: historyRef.current, decisions });
    } catch (err) {
      patchLast((m) => ({ ...m, content: m.content + `\n[Error: ${String(err)}]` }));
    } finally {
      setLoading(false);
    }
  }

  function openSaveForm(assistantMsg: Message, userText: string) {
    const slug = userText
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    const toolNames = [...new Set((assistantMsg.toolCalls ?? []).map((t) => t.name))].join(', ');
    setSkillForm({
      mode: 'create',
      name: slug || 'new-skill',
      description: userText.slice(0, 120),
      body: [
        `When the user asks to: ${userText}`,
        toolNames ? `Tools used: ${toolNames}` : '',
        assistantMsg.content ? `\n${assistantMsg.content}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  function openEditForm(skill: Skill) {
    setSkillForm({ mode: 'edit', id: skill.id, name: skill.name, description: skill.description, body: skill.body });
  }

  async function saveSkillForm() {
    if (!skillForm) return;
    setSkillBusy(true);
    try {
      const payload = {
        name: skillForm.name.trim(),
        description: skillForm.description.trim(),
        body: skillForm.body.trim(),
      };
      const url = skillForm.mode === 'create' ? '/api/skills' : `/api/skills/${skillForm.id}`;
      const res = await authFetch(url, {
        method: skillForm.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSkillForm(null);
        refreshSkills();
      }
    } finally {
      setSkillBusy(false);
    }
  }

  async function deleteSkillCard(skill: Skill) {
    if (!window.confirm(`Delete skill "${skill.name}"?`)) return;
    const res = await authFetch(`/api/skills/${skill.id}`, { method: 'DELETE' });
    if (res.ok) setSkills((prev) => prev.filter((s) => s.id !== skill.id));
  }

  const last = messages[messages.length - 1];
  const showTyping = loading && last?.role === 'assistant' && !last?.content && !(last?.toolCalls?.length);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', flex: 1, maxWidth: 760, margin: '0 auto', minWidth: 0 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--clr-border)' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>Geocat Assistant</h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--clr-muted)' }}>
            Search, explore &amp; edit the EEA metadata catalogue · {status || 'connecting…'}
          </p>
        </div>
        {providers.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={provider}
              onChange={(e) => changeProvider(e.target.value)}
              disabled={loading || !!pending}
              title="Model provider"
              style={selectStyle}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.configured}>
                  {p.label}
                  {p.configured ? '' : ' (no key)'}
                </option>
              ))}
            </select>
            <select
              value={model}
              onChange={(e) => changeModel(e.target.value)}
              disabled={loading || !!pending}
              title="Model"
              style={selectStyle}
            >
              {currentModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {modelLabel(m)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--clr-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
          <button
            onClick={() => signOut()}
            style={{ marginTop: 2, border: 'none', background: 'none', padding: 0, fontSize: 12, color: 'var(--clr-primary)', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--clr-muted)', fontSize: 14, maxWidth: 440 }}>
            <p style={{ fontSize: 15, color: 'var(--clr-text)' }}>Ask about the catalogue</p>
            <p>e.g. "Find datasets about air quality in Italy", "Summarise record &lt;uuid&gt;", or "Add the 'Air pollution' tag to record &lt;uuid&gt;".</p>
            <p style={{ fontSize: 12 }}>Edits require your explicit approval before they run.</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const streaming = loading && i === messages.length - 1;
          const prevUser = i > 0 ? messages[i - 1] : undefined;
          const canSave = msg.role === 'assistant' && !streaming && !!msg.toolCalls?.length && prevUser?.role === 'user';
          return (
            <Bubble
              key={i}
              msg={msg}
              onSaveAsSkill={canSave ? () => openSaveForm(msg, prevUser!.content) : undefined}
            />
          );
        })}
        {skillForm && (
          <SkillFormCard form={skillForm} onChange={setSkillForm} onSave={saveSkillForm} onCancel={() => setSkillForm(null)} busy={skillBusy} />
        )}
        {pending && <ConfirmCard tools={pending} onDecide={decide} busy={loading} />}
        {billing && <InsertCoinCard info={billing} onDismiss={() => setBilling(null)} />}
        {showTyping && (
          <div style={{ display: 'flex', gap: 4, paddingLeft: 4 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--clr-muted)', opacity: 0.5 }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: '1px solid var(--clr-border)', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, borderRadius: 12, border: '1px solid var(--clr-border)', background: 'var(--clr-surface)', padding: '8px 12px' }}>
          <textarea
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={pending ? 'Approve or reject the pending action above…' : 'Ask about catalogue records…'}
            disabled={!!pending}
            style={{ flex: 1, resize: 'vertical', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontFamily: 'inherit', minHeight: 60, maxHeight: 240, opacity: pending ? 0.5 : 1 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || !!pending}
            style={{ border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--clr-primary)', cursor: !input.trim() || loading || pending ? 'default' : 'pointer', opacity: !input.trim() || loading || pending ? 0.4 : 1 }}
          >
            Send
          </button>
        </div>
        <p style={{ margin: '6px 0 0', textAlign: 'center', fontSize: 10, color: 'var(--clr-muted)' }}>Enter to send · Shift+Enter for newline</p>
      </div>
    </div>

    <aside className="skills-sidebar" style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--clr-border)', padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Saved skills</div>
      {skills.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--clr-muted)' }}>
          No skills saved yet. Use "💾 Save as skill" under a reply to reuse it later.
        </p>
      ) : (
        skills.map((s) => (
          <SkillCard key={s.id} skill={s} onEdit={() => openEditForm(s)} onDelete={() => deleteSkillCard(s)} />
        ))
      )}
    </aside>
    </div>
  );
}
