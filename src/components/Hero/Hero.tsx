import HeroContent from '../HeroContent/HeroContent';
import VoicePlayground from '../VoicePlayground/VoicePlayground';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero} aria-label="Hero">
      {/* Left: marketing copy */}
      <div className={styles.left}>
        <HeroContent />
      </div>

      {/* Right: interactive voice playground */}
      <div className={styles.right}>
        <VoicePlayground />
      </div>
    </section>
  );
}
