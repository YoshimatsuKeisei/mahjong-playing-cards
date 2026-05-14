interface PlaceholderScreenProps {
  title: string;
  body: string;
  onBackHome: () => void;
}

export default function PlaceholderScreen({ title, body, onBackHome }: PlaceholderScreenProps) {
  return (
    <main className="screen placeholder-screen">
      <section className="placeholder-panel">
        <p className="eyebrow">Coming Soon</p>
        <h1>{title}</h1>
        <p>{body}</p>
        <button type="button" className="primary-button" onClick={onBackHome}>
          Home
        </button>
      </section>
    </main>
  );
}
