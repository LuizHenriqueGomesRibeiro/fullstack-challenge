import useAboutPageController from './controller';

export default function AboutPage() {
  const controller = useAboutPageController();

  return <section className="about-page">
    <div className="eyebrow">{controller.eyebrow}</div>
    <h1>{controller.title}</h1>
    <p className="lede">{controller.lede}</p>

    <div className="architecture-grid">
      {controller.cards.map((card) => (
        <article key={card.title}>
          <span>{card.title}</span>
          <p>{card.body}</p>
        </article>
      ))}
    </div>
  </section>
}