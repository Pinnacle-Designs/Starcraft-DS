import { isElectronApp } from "./overlaySync";
import { SEO_FAQ } from "./seo";

export function SeoFaq() {
  if (isElectronApp()) return null;

  return (
    <section className="seo-faq" aria-labelledby="seo-faq-heading">
      <h2 id="seo-faq-heading" className="seo-faq-title">
        Frequently asked questions
      </h2>
      <dl className="seo-faq-list">
        {SEO_FAQ.map((item) => (
          <div key={item.question} className="seo-faq-item">
            <dt className="seo-faq-question">{item.question}</dt>
            <dd className="seo-faq-answer">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
