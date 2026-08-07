import { useMemo, useState } from 'react';
import type { Locale } from '../lib/i18n';

type Props = { locale: Locale };
type Theme = 'meteor' | 'petal' | 'aurora';
const occasions = ['Birthday', 'Anniversary', 'Holiday', 'Wedding', 'Thank you', 'New beginning'];
const themes: Array<{ id: Theme; name: string; note: string }> = [
  { id: 'meteor', name: 'Meteor Note', note: 'ink blue & gold' },
  { id: 'petal', name: 'Petal Letter', note: 'rose paper & plum' },
  { id: 'aurora', name: 'Aurora Wish', note: 'lilac light & pearl' },
];

export default function Creator({ locale }: Props) {
  const [kind, setKind] = useState<'blessing' | 'wish'>('blessing');
  const [occasion, setOccasion] = useState('Birthday');
  const [recipient, setRecipient] = useState('');
  const [tone, setTone] = useState('Warm & sincere');
  const [theme, setTheme] = useState<Theme>('meteor');
  const [result, setResult] = useState<string[]>([]);
  const [selected, setSelected] = useState('May this moment open into a sky full of gentle surprises.');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeTheme = useMemo(() => themes.find((item) => item.id === theme)!, [theme]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setMessage('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/generations/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, locale, occasion, recipient, tone }) });
    const json = await response.json();
    if (!response.ok) { setMessage(json.error || 'Something drifted off course. Please try again.'); setLoading(false); return; }
    const variants = (json.variants ?? [json.content]).filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0);
    setResult(variants); setSelected(variants[0] ?? selected); setLoading(false);
  }
  async function publish() {
    const response = await fetch('/api/wishes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: selected, locale, visibility: 'published', theme }) });
    const json = await response.json(); setMessage(json.status === 'published' ? 'Your wish is now a small light on the wall.' : json.message || json.error);
  }
  function download() {
    const palette = theme === 'petal' ? ['#f9d8d1', '#7c3154', '#33162b'] : theme === 'aurora' ? ['#ddd7fa', '#6961a6', '#202047'] : ['#19245d', '#edcf91', '#f9f4e9'];
    const safe = selected.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><defs><radialGradient id="g" cx="75%" cy="18%"><stop stop-color="${palette[1]}"/><stop offset=".55" stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[2]}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><path d="M110 280 C420 90 740 260 1100 80" fill="none" stroke="${palette[1]}" stroke-width="4" opacity=".58"/><text x="95" y="155" fill="${palette[1]}" font-family="serif" font-size="36" letter-spacing="9">WISHMETEOR</text><foreignObject x="110" y="560" width="980" height="650"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${palette[2]};font:55px Georgia,serif;line-height:1.32">${safe}</div></foreignObject></svg>`;
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); link.download = `wishmeteor-${theme}.svg`; link.click(); URL.revokeObjectURL(link.href);
  }
  return <section className="maker" id="create">
    <div className="maker-steps" aria-label="Creation steps"><span className="is-active">01 · Choose a feeling</span><span>02 · Shape the words</span><span>03 · Make it a card</span></div>
    <div className="maker-grid">
      <form className="maker-form" onSubmit={submit}>
        <div className="kind-toggle" role="group" aria-label="Creation type"><button type="button" className={kind === 'blessing' ? 'selected' : ''} onClick={() => setKind('blessing')}>Send a blessing</button><button type="button" className={kind === 'wish' ? 'selected' : ''} onClick={() => setKind('wish')}>Make a wish</button></div>
        <div className="field-block"><span className="field-label">The occasion</span><div className="occasion-list">{occasions.map((item) => <button type="button" key={item} className={occasion === item ? 'selected' : ''} onClick={() => setOccasion(item)}>{item}</button>)}</div></div>
        {kind === 'blessing' && <label className="editor-field"><span>Who is this for?</span><input name="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="A dear friend, Mum, someone new…" /></label>}
        <label className="editor-field"><span>How should it feel?</span><select name="tone" value={tone} onChange={(event) => setTone(event.target.value)}><option>Warm & sincere</option><option>Light-hearted</option><option>Poetic & tender</option><option>Quietly elegant</option></select></label>
        <details className="advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}><summary>Make it more personal <i>+</i></summary><div><label className="editor-field"><span>{kind === 'wish' ? 'What is on your mind?' : 'A memory or detail to include'}</span><textarea name="note" required={kind === 'wish'} placeholder={kind === 'wish' ? 'A small beginning, more courage, somewhere to belong…' : 'Optional — an inside joke, a hope, a place you share'} /></label><label className="editor-field"><span>Name, if you wish</span><input name="name" placeholder="Optional" /></label><input type="hidden" name="length" value="medium" /></div></details>
        <button className="make-button" disabled={loading}>{loading ? 'Finding the right words…' : kind === 'wish' ? 'Shape my wish' : 'Write my blessing'} <span>↗</span></button>
        {message && !result.length && <p className="form-message" role="status">{message}</p>}
      </form>
      <aside className={`live-card ${theme}`} aria-label="Live card preview"><div className="card-halo" /><div className="card-paper"><div className="card-brand">wish<span>meteor</span><b>✦</b></div><p className="card-kicker">{kind === 'wish' ? 'A wish for tonight' : `For a ${occasion.toLowerCase()}`}</p><textarea aria-label="Card message" value={selected} onChange={(event) => setSelected(event.target.value)} /><div className="card-footer"><span>{activeTheme.name}</span><span>·</span><span>made with care</span></div></div><p className="card-note">{activeTheme.note}</p></aside>
    </div>
    {result.length > 0 && <div className="result-stage" aria-live="polite"><div className="result-intro"><span className="section-number">02</span><div><p className="eyebrow">Your words, three ways</p><h2>Choose the one that feels true.</h2></div></div><div className="result-body"><div className="variants">{result.map((item, index) => <button type="button" key={item} className={selected === item ? 'chosen' : ''} onClick={() => setSelected(item)}><span>0{index + 1}</span>{item}</button>)}</div><div className="theme-picker"><p className="eyebrow">Make it a card</p>{themes.map((item) => <button type="button" key={item.id} className={theme === item.id ? 'picked' : ''} onClick={() => setTheme(item.id)}><span className={`theme-swatch ${item.id}`} /><span><strong>{item.name}</strong><small>{item.note}</small></span></button>)}<div className="card-actions"><button type="button" className="quiet-button" onClick={() => navigator.clipboard.writeText(selected)}>Copy words</button><button type="button" className="quiet-button" onClick={download}>Download card</button>{kind === 'wish' && <button type="button" className="make-button" onClick={publish}>Share to wall <span>↗</span></button>}</div>{message && <p className="form-message" role="status">{message}</p>}</div></div></div>}
  </section>;
}
