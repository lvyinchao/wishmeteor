import { useMemo, useState } from 'react';
import { getCardImageCopy, getCopy, getWishOccasions, type Locale, type Occasion, type Theme, type Tone, type WishOccasion } from '../lib/i18n';

type Props = { locale: Locale };
const blessingOccasions: Occasion[] = ['birthday', 'anniversary', 'holiday', 'wedding', 'thanks', 'new-beginning'];
const wishOccasions: WishOccasion[] = ['personal-growth', 'love-connection', 'wellbeing', 'future-dream', 'journey', 'quiet-hope'];
const tones: Tone[] = ['warm', 'light', 'poetic', 'elegant'];
const themes: Theme[] = ['meteor', 'petal', 'aurora'];

function wrapCardText(context: CanvasRenderingContext2D, value: string, width: number) {
  const parts = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(value) ? Array.from(value) : value.split(/(\s+)/);
  const lines: string[] = []; let line = '';
  for (const part of parts) {
    const candidate = line + part;
    if (line && context.measureText(candidate).width > width) { lines.push(line.trim()); line = part.trimStart(); } else line = candidate;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export default function Creator({ locale }: Props) {
  const t = getCopy(locale).maker;
  const wishContext = getWishOccasions(locale);
  const imageCopy = getCardImageCopy(locale);
  const [kind, setKind] = useState<'blessing' | 'wish'>('blessing');
  const [occasion, setOccasion] = useState<Occasion | WishOccasion>('birthday');
  const [recipient, setRecipient] = useState('');
  const [tone, setTone] = useState<Tone>('warm');
  const [theme, setTheme] = useState<Theme>('meteor');
  const [result, setResult] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [cardImage, setCardImage] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const activeTheme = useMemo(() => t.themes[theme], [t, theme]);
  const preview = selected || (kind === 'wish' ? t.wishPlaceholder : t.detailPlaceholder);
  const activeOccasions: Array<Occasion | WishOccasion> = kind === 'wish' ? wishOccasions : blessingOccasions;
  const occasionLabel = (value: Occasion | WishOccasion) => kind === 'wish' ? wishContext.items[value as WishOccasion] : t.occasions[value as Occasion];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(''); setCardImage('');
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
    setCardImage('');
    setOccasion(next === 'wish' ? 'personal-growth' : 'birthday');
    setAdvancedOpen(next === 'blessing' && advancedOpen);
  }
  async function generateCardImage() {
    if (!selected) return;
    setImageLoading(true); setMessage('');
    try {
      const response = await fetch('/api/cards/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: selected, template: theme, locale, kind, occasion }) });
      const json = await response.json();
      if (!response.ok || typeof json.imageUrl !== 'string' || typeof json.statusUrl !== 'string') throw new Error('Card image generation failed.');
      for (let attempt = 0; attempt < 36; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        const task = await fetch(json.statusUrl, { cache: 'no-store' }).then((item) => item.json());
        if (task.status === 'ready') { setCardImage(json.imageUrl); break; }
        if (task.status === 'failed') throw new Error('Card image generation failed.');
        if (attempt === 35) throw new Error('Card image generation timed out.');
      }
    } catch { setMessage(t.error); }
    setImageLoading(false);
  }
  async function download() {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1800;
    const context = canvas.getContext('2d'); if (!context) return;
    const palette = theme === 'petal' ? ['#f9d8d1', '#7c3154', '#33162b'] : theme === 'aurora' ? ['#ddd7fa', '#6961a6', '#202047'] : ['#19245d', '#edcf91', '#f9f4e9'];
    const gradient = context.createRadialGradient(900, 260, 20, 650, 800, 1400); gradient.addColorStop(0, palette[1]); gradient.addColorStop(.55, palette[0]); gradient.addColorStop(1, palette[2]); context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    if (cardImage) await new Promise<void>((resolve) => { const image = new Image(); image.onload = () => { context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(); }; image.onerror = () => resolve(); image.src = cardImage; });
    context.fillStyle = 'rgba(18, 17, 42, .38)'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fffdf8'; context.font = '500 37px Georgia, serif'; context.fillText('WISHMETEOR', 100, 145);
    context.font = '500 62px Georgia, serif'; const lines = wrapCardText(context, selected || preview, 980); const lineHeight = 88; const startY = Math.max(550, 900 - ((lines.length - 1) * lineHeight) / 2); lines.slice(0, 7).forEach((line, index) => context.fillText(line, 110, startY + index * lineHeight));
    context.font = '500 24px sans-serif'; context.fillText(`${activeTheme.name}  ·  wishmeteor`, 100, 1690);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png')); if (!blob) return;
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `wishmeteor-${locale}-${theme}.png`; link.click(); URL.revokeObjectURL(link.href);
  }
  return <section className="maker" id="create">
    <div className="maker-steps" aria-label={t.steps.join(' · ')}><span className="is-active">01 · {t.steps[0]}</span><span>02 · {t.steps[1]}</span><span>03 · {t.steps[2]}</span></div>
    <div className="maker-grid"><form className="maker-form" onSubmit={submit}>
      <div className="kind-toggle" role="group" aria-label={t.steps[0]}><button type="button" className={kind === 'blessing' ? 'selected' : ''} onClick={() => chooseKind('blessing')}>{t.blessing}</button><button type="button" className={kind === 'wish' ? 'selected' : ''} onClick={() => chooseKind('wish')}>{t.wish}</button></div>
      <div className="field-block"><span className="field-label">{kind === 'wish' ? wishContext.label : t.occasion}</span><div className="occasion-list">{activeOccasions.map((item) => <button type="button" key={item} className={occasion === item ? 'selected' : ''} onClick={() => { setOccasion(item); setCardImage(''); }}>{occasionLabel(item)}</button>)}</div></div>
      {kind === 'blessing' && <label className="editor-field"><span>{t.recipient}</span><input name="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={t.recipientPlaceholder} /></label>}
      {kind === 'wish' && <label className="editor-field wish-intention"><span>{t.wishMind}</span><textarea name="note" required placeholder={t.wishPlaceholder} autoFocus /></label>}
      <label className="editor-field"><span>{t.tone}</span><select name="tone" value={tone} onChange={(event) => setTone(event.target.value as Tone)}>{tones.map((item) => <option key={item} value={item}>{t.tones[item]}</option>)}</select></label>
      {kind === 'blessing' && <details className="advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}><summary>{t.personal} <i>+</i></summary><div><label className="editor-field"><span>{t.detail}</span><textarea name="note" placeholder={t.detailPlaceholder} /></label><label className="editor-field"><span>{t.name}</span><input name="name" placeholder={t.namePlaceholder} /></label></div></details>}
      <input type="hidden" name="length" value="medium" />
      <button className="make-button" disabled={loading}>{loading ? t.generating : kind === 'wish' ? t.generateWish : t.generateBlessing} <span>↗</span></button>{message && !result.length && <p className="form-message" role="status">{message}</p>}
    </form><aside className={`live-card ${theme} ${cardImage ? 'has-generated-image' : ''}`} aria-label={t.preview}><div className="card-halo" /><div className="card-paper" style={cardImage ? { backgroundImage: `linear-gradient(rgba(20, 17, 47, .25), rgba(20, 17, 47, .48)), url("${cardImage}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}><div className="card-brand">wish<span>meteor</span><b>✦</b></div><p className="card-kicker">{kind === 'wish' ? t.wishKicker : `${t.forOccasion} ${occasionLabel(occasion)}`}</p><textarea aria-label={t.preview} value={selected} placeholder={preview} onChange={(event) => setSelected(event.target.value)} /><div className="card-footer"><span>{activeTheme.name}</span><span>·</span><span>{t.madeWithCare}</span></div></div><p className="card-note">{activeTheme.note}</p></aside></div>
    {result.length > 0 && <div className="result-stage" aria-live="polite"><div className="result-intro"><span className="section-number">02</span><div><p className="eyebrow">{t.resultKicker}</p><h2>{t.resultTitle}</h2></div></div><div className="result-body"><div className="variants">{result.map((item, index) => <button type="button" key={item} className={selected === item ? 'chosen' : ''} onClick={() => setSelected(item)}><span>0{index + 1}</span>{item}</button>)}</div><div className="theme-picker"><p className="eyebrow">{t.makeCard}</p>{themes.map((item) => <button type="button" key={item} className={theme === item ? 'picked' : ''} onClick={() => { setTheme(item); setCardImage(''); }}><span className={`theme-swatch ${item}`} /><span><strong>{t.themes[item].name}</strong><small>{t.themes[item].note}</small></span></button>)}<div className="card-actions"><button type="button" className="make-button" disabled={imageLoading} onClick={generateCardImage}>{imageLoading ? imageCopy.generating : imageCopy.generate} <span>↗</span></button><button type="button" className="quiet-button" onClick={() => navigator.clipboard.writeText(selected)}>{t.copy}</button><button type="button" className="quiet-button" onClick={download}>{t.download}</button>{kind === 'wish' && <button type="button" className="make-button" onClick={publish}>{t.share} <span>↗</span></button>}</div>{message && <p className="form-message" role="status">{message}</p>}</div></div></div>}
  </section>;
}
