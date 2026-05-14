'use client';

import styles from './Navbar.module.css';

const NAV_LINKS = [
  { label: 'Use cases', href: '#use-cases' },
  { label: 'Integrations', href: '#integrations' },
  { label: 'Docs', href: '#docs' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Blog', href: '#blog' },
  { label: 'Discord', href: '#discord' },
];

export default function Navbar() {
  return (
    <nav className={styles.navbar} aria-label="Main navigation">
      {/* Logo */}
      <a href="/" className={styles.logo} aria-label="Moss home">
        <img
          src="/moss-pale-yellow-logo.png"
          alt=""
          className={styles.logoMark}
          width={39}
          height={36}
        />
        <span className={styles.logoText}>Moss</span>
      </a>

      {/* Right: nav links + CTA */}
      <div className={styles.right}>
        <ul className={styles.nav} role="list">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a href={link.href} className={styles.navLink}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <a href="#start" className={styles.ctaButton}>
          Start free
        </a>
      </div>
    </nav>
  );
}
