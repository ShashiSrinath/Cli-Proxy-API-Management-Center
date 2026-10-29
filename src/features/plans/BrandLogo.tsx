import type { ProviderBrandLogoKey } from '@/features/providers/brandLogos';
import { PROVIDER_LOGOS } from '@/features/providers/brandLogos';
import styles from './PlansPage.module.scss';

interface BrandLogoProps {
  brandKey?: ProviderBrandLogoKey;
  size?: number;
  className?: string;
}

export function BrandLogo({ brandKey, size = 20, className }: BrandLogoProps) {
  const logo = brandKey ? PROVIDER_LOGOS[brandKey] : undefined;
  if (!logo) {
    return (
      <span
        className={[styles.logoFallback, className].filter(Boolean).join(' ')}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  const logoCls = [
    styles.logoImg,
    logo.transparent ? styles.logoTransparent : null,
    logo.themeSurface ? styles.logoThemeSurface : null,
    logo.darkSrc ? styles.logoThemeLight : null,
    logo.invertOnDark ? styles.logoInvertOnDark : null,
  ]
    .filter(Boolean)
    .join(' ');

  const darkLogoCls = [
    styles.logoImg,
    logo.transparent ? styles.logoTransparent : null,
    logo.themeSurface ? styles.logoThemeSurface : null,
    styles.logoThemeDark,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={[styles.brandLogoWrap, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <img src={logo.src} alt="" aria-hidden="true" className={logoCls} />
      {logo.darkSrc && (
        <img src={logo.darkSrc} alt="" aria-hidden="true" className={darkLogoCls} />
      )}
    </span>
  );
}
