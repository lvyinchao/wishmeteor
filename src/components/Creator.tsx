import { useMemo, useState } from 'react';
import { getCopy, type Locale, type Occasion, type Theme, type Tone } from '../lib/i18n';

type Props = { locale: Locale };
const occasions: Occasion[] = ['birthday', 'anniversary', 'holiday', 'wedding', 'thanks', 'new-beginning'];
const tones: Tone[] = ['warm', 'light', 'poetic', 'elegant'];
const themes: Theme[] = ['meteor', 'petal', 'aurora'];

export default function Creator({ locale }: Props) {
  const t = getCopy(locale).maker;
  const [kind, setKind] = useState<'blessing' | 'wish'>('blessing');
  const [occasion, setOccasion] = useState<Occasion>('birthday');
  const [recipient, setRecipient] = useState('');
  const [tone, setTone] = useState<Tone>('warm');
  const [theme, setTheme] = useState<Theme>('meteor');
  const [result, setResult] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeTheme = useMemo(() => t.themes[theme], [t, theme]);
  const preview = selected || (kind === 'wish' ? t.wishPlaceholder : t.detailPlaceholder);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/generations/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, locale, occasion, recipient, tone }) });
    const json = await response.json();
    if (!response.ok) { setMessage(t.error); setLoading(false); return; }
    const variants = (json.variants ?? [json.content]).filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0);
    setResult(variants); setSelected(variants[0] ?? ''); setLoading(false);
  }
  async function publish() {
    const response = await fetch('/api/wishes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: selected, locale, visibility: 'published', theme }) });
    const json = await response.json(); setMessage(json.status === 'published' ? t.published : t.error);
  }
  function chooseKind(next: 'blessing' | 'wish') {
    setKind(next);
    setResult([]);
    setSelected('');
    setMessage('');
    setAdvancedOpen(next === 'blessing' && advancedOpen);
  }
  function download() {
    const palette = theme === 'petal' ? ['#f9d8d1', '#7c3154', '#33162b'] : theme === 'aurora' ? ['#ddd7fa', '#6961a6', '#202047'] : ['#19245d', '#edcf91', '#f9f4e9'];
    const safe = selected.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><defs><radialGradient id="g" cx="75%" cy="18%"><stop stop-color="${palette[1]}"/><stop offset=".55" stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[2]}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><path d="M110 280 C420 90 740 260 1100 80" fill="none" stroke="${palette[1]}" stroke-width="4" opacity=".58"/><text x="95" y="155" fill="${palette[1]}" font-family="serif" font-size="36" letter-spacing="9">WISHMETEOR</text><foreignObject x="110" y="560" width="980" height="650"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${palette[2]};font:55px Georgia,serif;line-height:1.32">${safe}</div></foreignObject></svg>`;
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); link.download = `wishmeteor-${locale}-${theme}.svg`; link.click(); URL.revokeObjectURL(link.href);
  }
  return <section className="maker" id="create">
    <div className="maker-steps" aria-label={t.steps.join(' · ')}><span className="is-active">01 · {t.steps[0]}</span><span>02 · {t.steps[1]}</span><span>03 · {t.steps[2]}</span></div>
    <div className="maker-grid"><form className="maker-form" onSubmit={submit}>
      <div className="kind-toggle" role="group" aria-label={t.steps[0]}><button type="button" className={kind === 'blessing' ? 'selected' : ''} onClick={() => chooseKind('blessing')}>{t.blessing}</button><button type="button" className={kind === 'wish' ? 'selected' : ''} onClick={() => chooseKind('wish')}>{t.wish}</button></div>
      <div className="field-block"><span className="field-label">{t.occasion}</span><div className="occasion-list">{occasions.map((item) => <button type="button" key={item} className={occasion === item ? 'selected' : ''} onClick={() => setOccasion(item)}>{t.occasions[item]}</button>)}</div></div>
      {kind === 'blessing' && <label className="editor-field"><span>{t.recipient}</span><input name="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={t.recipientPlaceholder} /></label>}
      {kind === 'wish' && <label className="editor-field wish-intention"><span>{t.wishMind}</span><textarea name="note" required placeholder={t.wishPlaceholder} autoFocus /></label>}
      <label className="editor-field"><span>{t.tone}</span><select name="tone" value={tone} onChange={(event) => setTone(event.target.value as Tone)}>{tones.map((item) => <option key={item} value={item}>{t.tones[item]}</option>)}</select></label>
      {kind === 'blessing' && <details className="advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}><summary>{t.personal} <i>+</i></summary><div><label className="editor-field"><span>{t.detail}</span><textarea name="note" placeholder={t.detailPlaceholder} /></label><label className="editor-field"><span>{t.name}</span><input name="name" placeholder={t.namePlaceholder} /></label></div></details>}
      <input type="hidden" name="length" value="medium" />
      <button className="make-button" disabled={loading}>{loading ? t.generating : kind === 'wish' ? t.generateWish : t.generateBlessing} <span>↗</span></button>{message && !result.length && <p className="form-message" role="status">{message}</p>}
    </form><aside className={`live-card ${theme}`} aria-label={t.preview}><div className="card-halo" /><div className="card-paper"><div className="card-brand">wish<span>meteor</span><b>✦</b></div><p className="card-kicker">{kind === 'wish' ? t.wishKicker : `${t.forOccasion} ${t.occasions[occasion]}`}</p><textarea aria-label={t.preview} value={selected} placeholder={preview} onChange={(event) => setSelected(event.target.value)} /><div className="card-footer"><span>{activeTheme.name}</span><span>·</span><span>{t.madeWithCare}</span></div></div><p className="card-note">{activeTheme.note}</p></aside></div>
    {result.length > 0 && <div className="result-stage" aria-live="polite"><div className="result-intro"><span className="section-number">02</span><div><p className="eyebrow">{t.resultKicker}</p><h2>{t.resultTitle}</h2></div></div><div className="result-body"><div className="variants">{result.map((item, index) => <button type="button" key={item} className={selected === item ? 'chosen' : ''} onClick={() => setSelected(item)}><span>0{index + 1}</span>{item}</button>)}</div><div className="theme-picker"><p className="eyebrow">{t.makeCard}</p>{themes.map((item) => <button type="button" key={item} className={theme === item ? 'picked' : ''} onClick={() => setTheme(item)}><span className={`theme-swatch ${item}`} /><span><strong>{t.themes[item].name}</strong><small>{t.themes[item].note}</small></span></button>)}<div className="card-actions"><button type="button" className="quiet-button" onClick={() => navigator.clipboard.writeText(selected)}>{t.copy}</button><button type="button" className="quiet-button" onClick={download}>{t.download}</button>{kind === 'wish' && <button type="button" className="make-button" onClick={publish}>{t.share} <span>↗</span></button>}</div>{message && <p className="form-message" role="status">{message}</p>}</div></div></div>}
  </section>;
}
