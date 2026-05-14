import Navbar from '@/components/Navbar/Navbar';
import Hero from '@/components/Hero/Hero';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Navbar />
        <Hero />
      </div>
    </div>
  );
}
