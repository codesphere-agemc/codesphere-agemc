import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { apiRequest } from '../lib/api';
import { DIFFICULTY, formatDuration } from '../lib/aptitude';
import AptitudeResources from '../components/AptitudeResources';
import '../css/Aptitude.css';

// One aptitude topic: how many questions at each difficulty, and its siblings.
export default function AptitudeTopic() {
  const { slug } = useParams();
  // Loaded data is tagged with its slug, so switching topics never shows stale data.
  const [loaded, setLoaded] = useState({ slug: null, data: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/aptitude/topics/${slug}`)
      .then((r) => !cancelled && setLoaded({ slug, data: r, error: '' }))
      .catch((e) => !cancelled && setLoaded({ slug, data: null, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const current = loaded.slug === slug;
  const data = current ? loaded.data : null;
  const error = current ? loaded.error : '';
  const t = data?.topic;

  return (
    <>
      <Navbar />
      <main className="apt-page">
        <header className="apt-hero small" style={t ? { '--cat': t.color } : undefined}>
          <div className="container">
            <Link to="/aptitude#categories" className="apt-back"><i className="bi bi-arrow-left" aria-hidden="true" /> Aptitude</Link>
            {error && <h1>{error}</h1>}
            {t && (
              <>
                <span className="apt-eyebrow"><i className={`bi ${t.icon}`} aria-hidden="true" /> {t.categoryName}</span>
                <h1>{t.name}</h1>
                <p>{t.questions ? `${t.questions} practice question${t.questions === 1 ? '' : 's'}${t.avgSeconds ? ` · about ${formatDuration(t.avgSeconds)} each` : ''}` : 'Questions for this topic are being added.'}</p>
              </>
            )}
          </div>
        </header>

        {t && (
          <div className="container apt-body apt-topic-layout">
            <section className="apt-section">
              <h2>Difficulty</h2>
              <div className="apt-diff-grid">
                {Object.entries(DIFFICULTY).map(([key, d]) => (
                  <div key={key} className={`apt-diff tone-${d.tone}`}>
                    <strong>{t.byDifficulty[key] || 0}</strong>
                    <span>{d.label}</span>
                  </div>
                ))}
              </div>
              {t.questions > 0 ? (
                <div className="apt-topic-cta">
                  <Link to={`/aptitude/practice?topic=${t.slug}`} className="apt-btn apt-btn-primary"><i className="bi bi-play-fill" aria-hidden="true" /> Practise {t.name}</Link>
                  {Object.entries(DIFFICULTY).filter(([key]) => t.byDifficulty[key]).map(([key, d]) => (
                    <Link key={key} to={`/aptitude/practice?topic=${t.slug}&difficulty=${key}`} className="apt-btn">{d.label} only</Link>
                  ))}
                </div>
              ) : (
                <div className="apt-callout">
                  <i className="bi bi-info-circle" aria-hidden="true" />
                  <span>Questions for this topic are being written. Each comes with a hint, a step-by-step solution and a shortcut.</span>
                </div>
              )}
              {data.resources?.length > 0 && (
                <div className="apt-res-block">
                  <h2>Learn more elsewhere</h2>
                  <p className="apt-muted small">More practice and notes on {t.name} from other free sites. Opens in a new tab.</p>
                  <AptitudeResources links={data.resources} />
                </div>
              )}
            </section>

            <aside className="apt-section apt-siblings">
              <h2>More in {t.categoryName}</h2>
              <ul>
                {data.siblings.map((s) => (
                  <li key={s.slug}>
                    <Link to={`/aptitude/topics/${s.slug}`} className={s.slug === t.slug ? 'is-current' : ''} aria-current={s.slug === t.slug ? 'page' : undefined}>{s.name}</Link>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
