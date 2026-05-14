'use client';

import { useState } from 'react';
import styles from './HeroContent.module.css';

/* Inline SVG icons ─────────────────────────────────────────── */
function CopyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* YC logo ──────────────────────────────────────────────────── */
function YCLogo() {
  return (
    <img
      src="/yc-logo.png"
      alt="Y Combinator"
      className={styles.ycLogo}
    />
  );
}

const INSTALL_CMD = 'npm install @moss-dev/moss';

export default function HeroContent() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available in some contexts — silent fail */
    }
  }

  return (
    <div className={styles.container}>

      {/* ── Bottom: backed by YC ─────────────────────────── */}
      <div className={styles.backedBy}>
        <span className={styles.backedByLabel}>Backed by</span>
        <YCLogo />
      </div>
      
      {/* ── Top: headline + CTAs ─────────────────────────── */}
      <div className={styles.top}>
        <div className={styles.headlineGroup}>
          <h1 className={styles.headline}>
              Sub-10 ms semantic search for real-time voice AI. 
          </h1>
          <p className={styles.subheadline}>
            Moss slots in as the retrieval layer wherever your agent runs, across browser, edge, cloud or device. Zero infrastructure. 
          </p>
        </div>

        <div className={styles.ctaGroup}>
          <div className={styles.buttonRow}>
            <a href="#start" className={styles.btnPrimary}>
              Start building
            </a>
            <a href="#demo" className={styles.btnSecondary}>
              Book a demo
            </a>
          </div>

          {/* npm install snippet */}
          <div className={styles.snippetWrap}>
            <div className={styles.snippet}>
              <code className={styles.snippetCode}>
                <span className={styles.snippetNpm}>npm</span>
                {' '}
                <span className={styles.snippetCmd}>install @moss-dev/moss</span>
              </code>
              <button
                className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
                onClick={handleCopy}
                aria-label={copied ? 'Copied!' : 'Copy install command'}
                title={copied ? 'Copied!' : 'Copy to clipboard'}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>

      
    </div>
  );
}
