import { useState } from 'react';
import type { Locale } from '../lib/i18n';

type Props = { locale: Locale; mode?: 'blessing' | 'wish' };
const occasions = ['Birthday', 'Anniversary', 'Holiday', 'Wedding', 'Thank you', 'New beginning'];
export default function Creator({ locale, mode = 'blessing' }: Props) {
  const [kind, setKind] = useState(mode);
  const [result, setResult] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setSaved(false);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/generations/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, locale }) });
    const json = await response.json(); setResult(json.variants ?? [json.content]); setSelected((json.variants ?? [json.content])[0] ?? ''); setLoading(false);
  }
  async function publish() {
    const response = await fetch('/api/wishes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: selected, locale, visibility: 'published', theme: 'meteor' }) });
    const json = await response.json(); setMessage(json.status === 'published' ? 'Your wish is now on the wall.' : json.message); setSaved(true);
  }
  function download() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#101a43"/><stop offset="1" stop-color="#4b244f"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="950" cy="220" r="3" fill="#fff"/><path d="M120 230 L1040 620" stroke="#f6c880" stroke-width="8" opacity=".8"/><text x="100" y="210" fill="#f6c880" font-family="serif" font-size="42">WISHMETEOR</text><foreignObject x="110" y="600" width="980" height="600"><div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font:52px serif;line-height:1.35">${selected.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div></foreignObject></svg>`;
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); link.download = 'wishmeteor-card.svg'; link.click(); URL.revokeObjectURL(link.href);
  }
  return <section className="creator-shell" id="create">
    <div className="creator-heading"><span className="eyebrow">{kind === 'blessing' ? 'A message with a little magic' : 'A quiet place to begin'}</span><h2>{kind === 'blessing' ? 'Make it feel like you.' : 'Send a hope into the night.'}</h2></div>
    <div className="mode-switch"><button className={kind === 'blessing' ? 'active' : ''} onClick={() => setKind('blessing')}>Blessing</button><button className={kind === 'wish' ? 'active' : ''} onClick={() => setKind('wish')}>Wish</button></div>
    <form onSubmit={submit} className="generator-form">
      <label>Occasion<select name="occasion" defaultValue="Birthday">{occasions.map((item) => <option key={item}>{item}</option>)}</select></label>
      {kind === 'blessing' && <><label>For whom?<input name="recipient" placeholder="A friend, a parent, a colleague…" /></label><label>Name <input name="name" placeholder="Optional" /></label></>}
      <label>Tone<select name="tone"><option>Warm & sincere</option><option>Playful</option><option>Poetic</option><option>Elegant</option></select></label>
      <label className="wide">{kind === 'wish' ? 'What is in your heart?' : 'A detail to include'}<textarea name="note" required={kind === 'wish'} placeholder={kind === 'wish' ? 'A new beginning, a brave step, a little more peace…' : 'Optional — a shared memory, a hope, an inside joke'} /></label>
      <button className="primary wide" disabled={loading}>{loading ? 'Gathering stardust…' : kind === 'wish' ? 'Shape my wish' : 'Generate blessings'} <span>↗</span></button>
    </form>
    {result.length > 0 && <div className="result" aria-live="polite"><p className="eyebrow">Choose, edit, then send</p>{result.map((item, index) => <button key={index} className={selected === item ? 'variant selected' : 'variant'} onClick={() => setSelected(item)}>{item}</button>)}<textarea value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="Edit your message" /> <div className="result-actions"><button className="secondary" onClick={download}>Download card</button><button className="secondary" onClick={() => navigator.clipboard.writeText(selected)}>Copy message</button>{kind === 'wish' && <button className="primary" onClick={publish}>Share to wish wall</button>}</div>{saved && <p className="success">{message}</p>}</div>}
  </section>;
}
