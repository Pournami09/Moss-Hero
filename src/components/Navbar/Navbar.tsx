'use client';

import { useState } from 'react';
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
  const [menuOpen, setMenuOpen] = useState(false);

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

      {/* Desktop: nav links + CTA */}
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

      {/* Mobile: hamburger toggle */}
      <button
        className={styles.menuButton}
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
      >
        <span
          className={`${styles.hamburgerIcon} ${menuOpen ? styles.hamburgerOpen : ''}`}
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </span>
      </button>

      {/* Mobile: dropdown menu */}
      {menuOpen && (
        <div className={styles.mobileMenu}>
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={styles.mobileNavLink}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#start"
            className={styles.mobileCta}
            onClick={() => setMenuOpen(false)}
          >
            Start free
          </a>
        </div>
      )}
    </nav>
  );
}
