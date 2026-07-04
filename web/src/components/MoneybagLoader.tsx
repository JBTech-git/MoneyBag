'use client';

type Props = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
};

export default function MoneybagLoader({ label = 'Loading…', size = 'md' }: Props) {
  return (
    <div className={`mb-loader mb-loader--${size}`} role="status" aria-live="polite" aria-label={label}>
      <div className="mb-loader__stage">
        {/* Coins falling into the bag from top */}
        <span className="mb-loader__coin mb-loader__coin--1" aria-hidden="true">₹</span>
        <span className="mb-loader__coin mb-loader__coin--2" aria-hidden="true">₹</span>
        <span className="mb-loader__coin mb-loader__coin--3" aria-hidden="true">₹</span>

        {/* Expense chips rising out from bottom */}
        <span className="mb-loader__expense mb-loader__expense--1" aria-hidden="true">−</span>
        <span className="mb-loader__expense mb-loader__expense--2" aria-hidden="true">−</span>
        <span className="mb-loader__expense mb-loader__expense--3" aria-hidden="true">−</span>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/moneybag.png" alt="" className="mb-loader__bag" width={96} height={96} />
      </div>
      {label ? <p className="mb-loader__label">{label}</p> : null}
    </div>
  );
}
